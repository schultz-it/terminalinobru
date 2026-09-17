import type { Cliente } from '@terminalinobru/core';
import { afterEach, describe, expect, it } from 'vitest';
import type { DatabaseTerminalino } from '../src/db.js';
import { CHIAVE_CURSORE_CATALOGO, CHIAVE_CURSORE_CLIENTI } from '../src/impostazioni.js';
import {
  clientiAppSostituiti,
  leggiCursoreClienti,
  sincronizzaCatalogoEClienti,
  sincronizzaClienti,
} from '../src/sync/clienti.js';
import { fetchFinto, nuovoDb, prodotto } from './aiuti.js';

const connessione = { urlBridge: 'https://bridge.esempio.it', token: 'segreto' };
const adesso = () => new Date('2026-09-17T08:00:00.000Z');

let db: DatabaseTerminalino;
afterEach(async () => {
  await db?.delete();
});

function daEasyfatt(codice: string, nome: string, extra: Partial<Cliente> = {}): Cliente {
  return {
    id: codice,
    codice,
    nome,
    origine: 'easyfatt',
    aggiornatoIl: '2026-09-17T07:00:00.000Z',
    ...extra,
  };
}

function inApp(id: string, nome: string, extra: Partial<Cliente> = {}): Cliente {
  return { id, nome, origine: 'app', aggiornatoIl: '2026-09-16T07:00:00.000Z', ...extra };
}

const rispostaClienti = (corpo: {
  aggiornatoIl?: string;
  clienti?: Cliente[];
  clientiEliminati?: string[];
}) =>
  Response.json({
    aggiornatoIl: corpo.aggiornatoIl ?? '2026-09-17T07:00:00Z',
    clienti: corpo.clienti ?? [],
    clientiEliminati: corpo.clientiEliminati ?? [],
  });

describe('sincronizzaClienti', () => {
  it('la prima volta scarica tutti i clienti, salva il cursore e conserva quelli creati in app', async () => {
    db = nuovoDb();
    await db.clienti.bulkPut([
      daEasyfatt('OLD', 'Cliente di un vecchio tenant'),
      inApp('uuid-1', 'Creato sul telefono', { partitaIva: '09876543210' }),
    ]);
    const { recupera, chiamate } = fetchFinto(
      rispostaClienti({
        clienti: [daEasyfatt('0018', 'Ceramiche Italiane'), daEasyfatt('0020', 'Brunelli')],
      }),
    );

    const esito = await sincronizzaClienti({ db, impostazioni: connessione, recupera });

    expect(esito).toEqual({ ok: true, completa: true, clientiAggiornati: 2, clientiEliminati: 0 });
    expect(chiamate.map((c) => c.url)).toEqual(['https://bridge.esempio.it/api/clienti']);
    expect(new Headers(chiamate[0]?.init?.headers).get('Authorization')).toBe('Bearer segreto');
    expect((await db.clienti.toArray()).map((c) => c.id).sort()).toEqual([
      '0018',
      '0020',
      'uuid-1',
    ]);
    expect(await leggiCursoreClienti(db)).toBe('2026-09-17T07:00:00Z');
  });

  it('rimette il codice, che il bridge manda solo come id', async () => {
    db = nuovoDb();
    const { recupera } = fetchFinto(
      rispostaClienti({
        clienti: [{ id: '0018', nome: 'Ceramiche', origine: 'easyfatt', aggiornatoIl: 'x' }],
      }),
    );
    await sincronizzaClienti({ db, impostazioni: connessione, recupera });
    expect((await db.clienti.get('0018'))?.codice).toBe('0018');
  });

  it('poi chiede il delta con il suo cursore, separato da quello del catalogo', async () => {
    db = nuovoDb();
    await db.clienti.bulkPut([daEasyfatt('0018', 'Ceramiche'), daEasyfatt('0020', 'Brunelli')]);
    await db.impostazioni.bulkPut([
      { chiave: CHIAVE_CURSORE_CLIENTI, valore: '2026-09-16T10:00:00+02:00' },
      { chiave: CHIAVE_CURSORE_CATALOGO, valore: '2026-01-01T00:00:00Z' },
    ]);
    const { recupera, chiamate } = fetchFinto(
      rispostaClienti({
        aggiornatoIl: '2026-09-17T09:00:00Z',
        clienti: [daEasyfatt('0018', 'Ceramiche Italiane srl'), daEasyfatt('0030', 'Nuovo')],
        clientiEliminati: ['0020'],
      }),
    );

    const esito = await sincronizzaClienti({ db, impostazioni: connessione, recupera });

    expect(esito).toEqual({ ok: true, completa: false, clientiAggiornati: 2, clientiEliminati: 1 });
    expect(chiamate[0]?.url).toBe(
      'https://bridge.esempio.it/api/clienti?dal=2026-09-16T10%3A00%3A00%2B02%3A00',
    );
    expect((await db.clienti.toArray()).map((c) => c.id).sort()).toEqual(['0018', '0030']);
    expect((await db.clienti.get('0018'))?.nome).toBe('Ceramiche Italiane srl');
    expect(await leggiCursoreClienti(db)).toBe('2026-09-17T09:00:00Z');
    expect((await db.impostazioni.get(CHIAVE_CURSORE_CATALOGO))?.valore).toBe(
      '2026-01-01T00:00:00Z',
    );
  });

  it('un cliente creato in app con la stessa partita IVA o codice fiscale lascia il posto a quello di Easyfatt', async () => {
    db = nuovoDb();
    await db.clienti.bulkPut([
      inApp('uuid-iva', 'Ceramiche (dal telefono)', { partitaIva: '03322350178' }),
      inApp('uuid-cf', 'Rossi Mario (dal telefono)', { codiceFiscale: 'RSSMRA80A01H501U' }),
      inApp('uuid-altro', 'Sconosciuto a Easyfatt', { partitaIva: '01234567890' }),
    ]);
    await db.impostazioni.put({ chiave: CHIAVE_CURSORE_CLIENTI, valore: '2026-09-16T00:00:00Z' });
    const { recupera } = fetchFinto(
      rispostaClienti({
        clienti: [
          daEasyfatt('0018', 'Ceramiche Italiane', { partitaIva: '03322350178' }),
          daEasyfatt('0040', 'Rossi Mario', { codiceFiscale: 'rssmra80a01h501u' }),
        ],
      }),
    );

    expect(await sincronizzaClienti({ db, impostazioni: connessione, recupera })).toMatchObject({
      ok: true,
    });
    expect((await db.clienti.toArray()).map((c) => c.id).sort()).toEqual([
      '0018',
      '0040',
      'uuid-altro',
    ]);
  });

  it('i tombstone non tolgono mai un cliente creato in app e non vengono salvati', async () => {
    db = nuovoDb();
    await db.clienti.bulkPut([inApp('X1', 'Creato in app'), daEasyfatt('0018', 'Ceramiche')]);
    await db.impostazioni.put({ chiave: CHIAVE_CURSORE_CLIENTI, valore: '2026-09-16T00:00:00Z' });
    const { recupera } = fetchFinto(
      rispostaClienti({
        clienti: [daEasyfatt('0018', 'Ceramiche', { eliminatoIl: '2026-09-17T07:00:00Z' })],
        clientiEliminati: ['X1'],
      }),
    );

    await sincronizzaClienti({ db, impostazioni: connessione, recupera });

    expect((await db.clienti.toArray()).map((c) => c.id)).toEqual(['X1']);
  });

  it('con una risposta di forma inattesa non tocca nulla e torna un errore leggibile', async () => {
    db = nuovoDb();
    await db.clienti.put(daEasyfatt('0018', 'Ceramiche'));
    const { recupera } = fetchFinto(Response.json({ clienti: 'no' }));

    const esito = await sincronizzaClienti({ db, impostazioni: connessione, recupera });

    expect(esito).toEqual({
      ok: false,
      messaggio: 'Risposta del bridge in un formato inatteso: aggiorna app e bridge.',
    });
    expect(await db.clienti.count()).toBe(1);
    expect(await leggiCursoreClienti(db)).toBeUndefined();
  });
});

describe('sincronizzaCatalogoEClienti', () => {
  const catalogo = () =>
    Response.json({
      aggiornatoIl: '2026-09-16T12:34:56Z',
      prodotti: [prodotto('A1', 'Scatola')],
      barcode: [],
      prodottiEliminati: [],
      barcodeEliminati: [],
    });

  it('scarica catalogo e clienti in sequenza e somma gli esiti', async () => {
    db = nuovoDb();
    const { recupera, chiamate } = fetchFinto(
      catalogo(),
      rispostaClienti({ clienti: [daEasyfatt('0018', 'Ceramiche')] }),
    );

    const esito = await sincronizzaCatalogoEClienti({
      db,
      impostazioni: connessione,
      recupera,
      adesso,
    });

    expect(esito).toEqual({
      ok: true,
      completa: true,
      prodottiAggiornati: 1,
      prodottiEliminati: 0,
      barcodeAggiornati: 0,
      barcodeEliminati: 0,
      clientiAggiornati: 1,
      clientiEliminati: 0,
    });
    expect(chiamate.map((c) => c.url)).toEqual([
      'https://bridge.esempio.it/api/catalogo',
      'https://bridge.esempio.it/api/clienti',
    ]);
    expect(await db.prodotti.count()).toBe(1);
    expect(await db.clienti.count()).toBe(1);
  });

  it('se falliscono solo i clienti il catalogo resta aggiornato e il messaggio lo dice', async () => {
    db = nuovoDb();
    const { recupera } = fetchFinto(catalogo(), new TypeError('Failed to fetch'));

    const esito = await sincronizzaCatalogoEClienti({
      db,
      impostazioni: connessione,
      recupera,
      adesso,
    });

    expect(esito).toEqual({
      ok: false,
      messaggio:
        "Catalogo aggiornato, clienti no: Bridge non raggiungibile: controlla la connessione e l'indirizzo nelle impostazioni.",
    });
    expect(await db.prodotti.count()).toBe(1);
  });

  it('se fallisce il catalogo non chiede nemmeno i clienti', async () => {
    db = nuovoDb();
    const { recupera, chiamate } = fetchFinto(new Response('', { status: 401 }));

    const esito = await sincronizzaCatalogoEClienti({
      db,
      impostazioni: connessione,
      recupera,
      adesso,
    });

    expect(esito).toMatchObject({ ok: false });
    expect(chiamate).toHaveLength(1);
  });
});

describe('clientiAppSostituiti', () => {
  it('confronta partita IVA e codice fiscale senza badare alle maiuscole, solo per i clienti app', () => {
    expect(
      clientiAppSostituiti(
        [
          inApp('a', 'A', { partitaIva: 'de123456789' }),
          inApp('b', 'B', { codiceFiscale: 'ABC' }),
          daEasyfatt('c', 'C', { partitaIva: 'DE123456789' }),
          inApp('d', 'D'),
        ],
        [{ partitaIva: 'DE123456789' }, { codiceFiscale: 'abc' }, {}],
      ),
    ).toEqual(['a', 'b']);
  });
});
