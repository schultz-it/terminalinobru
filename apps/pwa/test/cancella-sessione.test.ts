import { afterEach, describe, expect, it } from 'vitest';
import type { DatabaseTerminalino } from '../src/db.js';
import {
  aggiungiRiga,
  cancellaSessione,
  cancellaSessioneOvunque,
  chiudiSessione,
  creaSessione,
  ErroreSessione,
  sessioneCompleta,
} from '../src/sessioni/operazioni.js';
import { fetchFinto, nuovoDb } from './aiuti.js';

const connessione = { urlBridge: 'https://bridge.esempio.it', token: 'segreto' };

let db: DatabaseTerminalino;
afterEach(async () => {
  await db?.delete();
});

async function sessioneConRighe(nome: string) {
  const sessione = await creaSessione(db, {
    tipo: 'ddt',
    nome,
    modalita: 'chiedi_quantita',
    cliente: { nome: 'Ceramiche Italiane' },
  });
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

describe('cancellaSessioneOvunque', () => {
  async function sessioneInviata(nome: string) {
    const sessione = await sessioneConRighe(nome);
    await chiudiSessione(db, sessione.id);
    await db.codaUpload.clear();
    await db.sessioni.update(sessione.id, { inviataIl: '2026-09-17T12:00:00.000Z' });
    return sessione;
  }

  it('con 204 dal bridge cancella anche sul telefono', async () => {
    db = nuovoDb();
    const sessione = await sessioneInviata('Da cancellare');
    const { recupera, chiamate } = fetchFinto(new Response(null, { status: 204 }));

    await cancellaSessioneOvunque(db, connessione, sessione.id, recupera);

    expect(chiamate).toHaveLength(1);
    expect(chiamate[0]?.url).toBe(`https://bridge.esempio.it/api/sessioni/${sessione.id}`);
    expect(chiamate[0]?.init?.method).toBe('DELETE');
    expect(new Headers(chiamate[0]?.init?.headers).get('Authorization')).toBe('Bearer segreto');
    expect(await db.sessioni.get(sessione.id)).toBeUndefined();
    expect(await db.righe.count()).toBe(0);
  });

  it('con 409 mostra il messaggio del bridge e lascia la sessione sul telefono', async () => {
    db = nuovoDb();
    const sessione = await sessioneInviata('Già scaricata');
    const messaggio =
      'La sessione è già stata scaricata da Easyfatt: non può più essere cancellata dal telefono.';
    const { recupera } = fetchFinto(Response.json({ errore: messaggio }, { status: 409 }));

    await expect(cancellaSessioneOvunque(db, connessione, sessione.id, recupera)).rejects.toThrow(
      new ErroreSessione(messaggio),
    );
    expect(await db.sessioni.get(sessione.id)).toBeDefined();
    expect(await db.righe.count()).toBe(2);
  });

  it('con 404 il bridge non la conosce più: si cancella dal telefono', async () => {
    db = nuovoDb();
    const sessione = await sessioneInviata('Sparita dal bridge');
    const { recupera } = fetchFinto(
      Response.json({ errore: 'Sessione non trovata.' }, { status: 404 }),
    );
    await cancellaSessioneOvunque(db, connessione, sessione.id, recupera);
    expect(await db.sessioni.get(sessione.id)).toBeUndefined();
  });

  it('senza rete non cancella nulla e lo dice', async () => {
    db = nuovoDb();
    const sessione = await sessioneInviata('Offline');
    const { recupera } = fetchFinto(new TypeError('Failed to fetch'));
    await expect(cancellaSessioneOvunque(db, connessione, sessione.id, recupera)).rejects.toThrow(
      'Sessione non cancellata. Bridge non raggiungibile',
    );
    expect(await db.sessioni.get(sessione.id)).toBeDefined();
  });

  it('una sessione mai inviata si cancella solo sul telefono, senza chiamare il bridge', async () => {
    db = nuovoDb();
    const sessione = await sessioneConRighe('Solo locale');
    await chiudiSessione(db, sessione.id);
    const { recupera, chiamate } = fetchFinto();
    await cancellaSessioneOvunque(db, connessione, sessione.id, recupera);
    expect(chiamate).toHaveLength(0);
    expect(await db.sessioni.get(sessione.id)).toBeUndefined();
    expect(await db.codaUpload.count()).toBe(0);
  });

  it('una sessione inesistente non è un errore', async () => {
    db = nuovoDb();
    const { recupera, chiamate } = fetchFinto();
    await cancellaSessioneOvunque(db, connessione, 'non-esiste', recupera);
    expect(chiamate).toHaveLength(0);
  });
});
