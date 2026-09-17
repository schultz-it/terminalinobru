import { afterEach, describe, expect, it } from 'vitest';
import type { DatabaseTerminalino } from '../src/db.js';
import {
  aggiungiRiga,
  cancellaSessione,
  chiudiSessione,
  creaSessione,
  sessioneCompleta,
} from '../src/sessioni/operazioni.js';
import { nuovoDb } from './aiuti.js';

let db: DatabaseTerminalino;
afterEach(async () => {
  await db?.delete();
});

async function sessioneConRighe(nome: string) {
  const sessione = await creaSessione(db, { tipo: 'ddt', nome, modalita: 'chiedi_quantita' });
  await aggiungiRiga(db, sessione.id, { codiceProdotto: 'A1', quantita: 2 });
  await aggiungiRiga(db, sessione.id, { codiceProdotto: 'B2', quantita: 1 });
  return sessione;
}

describe('cancellaSessione', () => {
  it('cancella una sessione aperta con le sue righe', async () => {
    db = nuovoDb();
    const sessione = await sessioneConRighe('Bozza');
    await cancellaSessione(db, sessione.id);
    expect(await db.sessioni.get(sessione.id)).toBeUndefined();
    expect(await db.righe.count()).toBe(0);
  });

  it('cancella una sessione chiusa non ancora inviata e toglie la voce dalla coda', async () => {
    db = nuovoDb();
    const sessione = await sessioneConRighe('Chiusa offline');
    await chiudiSessione(db, sessione.id);
    expect(await db.codaUpload.count()).toBe(1);
    await cancellaSessione(db, sessione.id);
    expect(await db.sessioni.get(sessione.id)).toBeUndefined();
    expect(await db.righe.count()).toBe(0);
    expect(await db.codaUpload.count()).toBe(0);
  });

  it('rifiuta una sessione già ricevuta dal bridge, anche se riaperta', async () => {
    db = nuovoDb();
    const sessione = await sessioneConRighe('Inviata');
    await chiudiSessione(db, sessione.id);
    // Come fa la coda dopo una POST riuscita.
    await db.sessioni.update(sessione.id, { inviataIl: '2026-09-17T12:00:00.000Z' });
    await expect(cancellaSessione(db, sessione.id)).rejects.toThrow('già sul bridge');
    expect(await db.sessioni.get(sessione.id)).toBeDefined();
    expect(await db.righe.count()).toBe(2);
  });

  it("l'annotazione locale dell'invio non viene spedita al bridge", async () => {
    db = nuovoDb();
    const sessione = await sessioneConRighe('Spedita');
    await chiudiSessione(db, sessione.id);
    await db.sessioni.update(sessione.id, { inviataIl: '2026-09-17T12:00:00.000Z' });
    const completa = await sessioneCompleta(db, sessione.id);
    expect(completa).toBeDefined();
    expect('inviataIl' in (completa ?? {})).toBe(false);
    expect(completa?.righe).toHaveLength(2);
  });

  it('una sessione inesistente non è un errore', async () => {
    db = nuovoDb();
    await expect(cancellaSessione(db, 'non-esiste')).resolves.toBeUndefined();
  });
});
