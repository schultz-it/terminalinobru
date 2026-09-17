import { afterEach, describe, expect, it } from 'vitest';
import type { DatabaseTerminalino } from '../src/db.js';
import {
  aggiungiRiga,
  chiudiSessione,
  creaSessione,
  riapriSessione,
} from '../src/sessioni/operazioni.js';
import { allineaSessioniLocali, sessioniDaAllineare } from '../src/sync/sessioni.js';
import { fetchFinto, nuovoDb } from './aiuti.js';

const connessione = { urlBridge: 'https://bridge.esempio.it', token: 'segreto' };

let db: DatabaseTerminalino;
afterEach(async () => {
  await db?.delete();
});

describe('sessioniDaAllineare', () => {
  it('propone lo stato del bridge quando è diverso da quello locale', () => {
    const locali = [
      { id: 'a', stato: 'chiusa' as const },
      { id: 'b', stato: 'esportata' as const },
      { id: 'c', stato: 'importata' as const },
    ];
    const statoBridge = new Map<string, 'chiusa' | 'esportata' | 'importata'>([
      ['a', 'esportata'],
      ['b', 'chiusa'],
      ['c', 'importata'],
    ]);
    expect(sessioniDaAllineare(locali, statoBridge)).toEqual([
      { id: 'a', stato: 'esportata' },
      { id: 'b', stato: 'chiusa' },
    ]);
  });

  it('non tocca mai le sessioni aperte sul telefono', () => {
    const locali = [{ id: 'a', stato: 'aperta' as const }];
    const statoBridge = new Map([['a', 'importata' as const]]);
    expect(sessioniDaAllineare(locali, statoBridge)).toEqual([]);
  });

  it('lascia stare le sessioni non ancora arrivate al bridge', () => {
    const locali = [{ id: 'a', stato: 'chiusa' as const }];
    expect(sessioniDaAllineare(locali, new Map())).toEqual([]);
  });

  it('lascia stare le sessioni con un invio in coda: il bridge ha ancora la versione vecchia', () => {
    const locali = [
      { id: 'a', stato: 'chiusa' as const },
      { id: 'b', stato: 'chiusa' as const },
    ];
    const statoBridge = new Map([
      ['a', 'esportata' as const],
      ['b', 'esportata' as const],
    ]);
    expect(sessioniDaAllineare(locali, statoBridge, new Set(['a']))).toEqual([
      { id: 'b', stato: 'esportata' },
    ]);
  });
});

describe('allineaSessioniLocali', () => {
  it('aggiorna solo le sessioni locali non aperte il cui stato è cambiato sul bridge', async () => {
    db = nuovoDb();
    const chiusa = await creaSessione(db, {
      tipo: 'inventario',
      nome: 'Scaffale A',
      modalita: 'chiedi_quantita',
    });
    await aggiungiRiga(db, chiusa.id, { codiceProdotto: 'A1', quantita: 1 });
    await chiudiSessione(db, chiusa.id);
    // Già spedita al bridge: la voce non è più in coda.
    await db.codaUpload.clear();

    const aperta = await creaSessione(db, {
      tipo: 'inventario',
      nome: 'Scaffale B',
      modalita: 'chiedi_quantita',
    });

    const { recupera } = fetchFinto(
      Response.json([
        {
          id: chiusa.id,
          tipo: 'inventario',
          nome: 'Scaffale A',
          stato: 'esportata',
          modalita: 'chiedi_quantita',
          creataIl: chiusa.creataIl,
          chiusaIl: '2026-09-17T09:00:00.000Z',
          ricevutaIl: '2026-09-17T09:00:01.000Z',
          esportataIl: '2026-09-17T09:05:00.000Z',
          conteggioRighe: 1,
          sommaQuantita: 1,
        },
        // Anche se il bridge avesse per assurdo un id che sul telefono è ancora aperto, non va
        // toccato: l'allineamento ignora sempre le sessioni "aperta".
        {
          id: aperta.id,
          tipo: 'inventario',
          nome: 'Scaffale B',
          stato: 'importata',
          modalita: 'chiedi_quantita',
          creataIl: aperta.creataIl,
          chiusaIl: '2026-09-17T09:00:00.000Z',
          ricevutaIl: '2026-09-17T09:00:01.000Z',
          importataIl: '2026-09-17T09:10:00.000Z',
          conteggioRighe: 3,
          sommaQuantita: 9,
        },
      ]),
    );

    const esito = await allineaSessioniLocali({ db, impostazioni: connessione, recupera });
    expect(esito).toEqual({ ok: true, aggiornate: 1 });

    expect((await db.sessioni.get(chiusa.id))?.stato).toBe('esportata');
    // La sessione aperta sul telefono resta aperta anche se il bridge (a torto: non può
    // conoscerla) dicesse altro.
    expect((await db.sessioni.get(aperta.id))?.stato).toBe('aperta');
  });

  it('una sessione riaperta e richiusa resta "chiusa" finché la coda non la rispedisce', async () => {
    db = nuovoDb();
    const sessione = await creaSessione(db, {
      tipo: 'ddt',
      nome: 'Consegna',
      modalita: 'somma_uno',
    });
    await aggiungiRiga(db, sessione.id, { codiceProdotto: 'A1', quantita: 1 });
    await chiudiSessione(db, sessione.id);
    // Prima versione già inviata (voce tolta dalla coda) ed esportata dal PC.
    await db.codaUpload.clear();
    // Sul telefono si riapre e si richiude: la nuova versione è in coda.
    await riapriSessione(db, sessione.id);
    await aggiungiRiga(db, sessione.id, { codiceProdotto: 'B2', quantita: 2 });
    await chiudiSessione(db, sessione.id);
    expect(await db.codaUpload.count()).toBe(1);

    const rispostaBridge = () =>
      Response.json([
        {
          id: sessione.id,
          tipo: 'ddt',
          nome: 'Consegna',
          stato: 'esportata',
          modalita: 'somma_uno',
          creataIl: sessione.creataIl,
          chiusaIl: '2026-09-17T09:00:00.000Z',
          ricevutaIl: '2026-09-17T09:00:01.000Z',
          esportataIl: '2026-09-17T09:05:00.000Z',
          conteggioRighe: 1,
          sommaQuantita: 1,
        },
      ]);
    const primo = await allineaSessioniLocali({
      db,
      impostazioni: connessione,
      recupera: fetchFinto(rispostaBridge()).recupera,
    });
    expect(primo).toEqual({ ok: true, aggiornate: 0 });
    // Resta "chiusa": così la coda la spedisce invece di scartarla come già esportata.
    expect((await db.sessioni.get(sessione.id))?.stato).toBe('chiusa');

    // Spedita (voce tolta): ora lo stato del bridge vale.
    await db.codaUpload.clear();
    const secondo = await allineaSessioniLocali({
      db,
      impostazioni: connessione,
      recupera: fetchFinto(rispostaBridge()).recupera,
    });
    expect(secondo).toEqual({ ok: true, aggiornate: 1 });
    expect((await db.sessioni.get(sessione.id))?.stato).toBe('esportata');
  });

  it('non lancia se il bridge non risponde: torna un errore leggibile', async () => {
    db = nuovoDb();
    const { recupera } = fetchFinto(new TypeError('Failed to fetch'));
    const esito = await allineaSessioniLocali({ db, impostazioni: connessione, recupera });
    expect(esito).toEqual({
      ok: false,
      messaggio:
        "Bridge non raggiungibile: controlla la connessione e l'indirizzo nelle impostazioni.",
    });
  });
});
