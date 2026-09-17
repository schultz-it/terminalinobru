import { afterEach, describe, expect, it } from 'vitest';
import { CHIAVE_CURSORE_CATALOGO } from '../src/impostazioni.js';
import {
  INTERVALLO_SYNC_AUTOMATICA_MS,
  leggiCursoreCatalogo,
  serveSyncAutomatica,
  sincronizzaCatalogo,
} from '../src/sync/catalogo.js';
import type { DatabaseTerminalino } from '../src/db.js';
import { barcode, fetchFinto, nuovoDb, prodotto } from './aiuti.js';

const connessione = { urlBridge: 'https://bridge.esempio.it/', token: 'segreto' };
const adesso = () => new Date('2026-09-17T08:00:00.000Z');

let db: DatabaseTerminalino;
afterEach(async () => {
  await db?.delete();
});

describe('sincronizzaCatalogo', () => {
  it('la prima volta scarica il catalogo completo e salva il cursore del bridge', async () => {
    db = nuovoDb();
    const { recupera, chiamate } = fetchFinto(
      Response.json({
        aggiornatoIl: '2026-09-16T12:34:56Z',
        prodotti: [prodotto('A1', 'Scatola'), prodotto('B2', 'Nastro')],
        barcode: [barcode('8001', 'A1')],
        prodottiEliminati: [],
        barcodeEliminati: [],
      }),
    );

    const esito = await sincronizzaCatalogo({ db, impostazioni: connessione, recupera, adesso });

    expect(esito).toEqual({
      ok: true,
      completa: true,
      prodottiAggiornati: 2,
      prodottiEliminati: 0,
      barcodeAggiornati: 1,
      barcodeEliminati: 0,
    });
    expect(chiamate).toHaveLength(1);
    expect(chiamate[0]?.url).toBe('https://bridge.esempio.it/api/catalogo');
    expect(new Headers(chiamate[0]?.init?.headers).get('Authorization')).toBe('Bearer segreto');
    expect(await db.prodotti.count()).toBe(2);
    expect(await db.barcode.get('8001')).toMatchObject({ codiceProdotto: 'A1' });
    expect(await leggiCursoreCatalogo(db)).toBe('2026-09-16T12:34:56Z');
    expect((await db.impostazioni.get('ultimaSincronizzazione'))?.valore).toBe(
      '2026-09-17T08:00:00.000Z',
    );
  });

  it("dopo la prima volta chiede il delta con il cursore tale e quale, non con l'orologio", async () => {
    db = nuovoDb();
    await db.prodotti.bulkPut([
      prodotto('A1', 'Scatola'),
      prodotto('B2', 'Nastro'),
      prodotto('C3', 'Pluriball'),
    ]);
    await db.barcode.bulkPut([barcode('8001', 'A1'), barcode('8002', 'B2')]);
    await db.impostazioni.put({
      chiave: CHIAVE_CURSORE_CATALOGO,
      valore: '2026-09-16T12:34:56+02:00',
    });

    const { recupera, chiamate } = fetchFinto(
      Response.json({
        aggiornatoIl: '2026-09-17T07:00:00Z',
        prodotti: [prodotto('A1', 'Scatola grande', { giacenza: 12 }), prodotto('D4', 'Film')],
        barcode: [barcode('8004', 'D4')],
        prodottiEliminati: ['B2'],
        barcodeEliminati: ['8002'],
      }),
    );

    const esito = await sincronizzaCatalogo({ db, impostazioni: connessione, recupera, adesso });

    expect(esito).toMatchObject({
      ok: true,
      completa: false,
      prodottiAggiornati: 2,
      prodottiEliminati: 1,
    });
    expect(chiamate[0]?.url).toBe(
      'https://bridge.esempio.it/api/catalogo?dal=2026-09-16T12%3A34%3A56%2B02%3A00',
    );
    expect((await db.prodotti.toArray()).map((p) => p.codice).sort()).toEqual(['A1', 'C3', 'D4']);
    expect(await db.prodotti.get('A1')).toMatchObject({
      descrizione: 'Scatola grande',
      giacenza: 12,
    });
    expect((await db.barcode.toArray()).map((b) => b.barcode).sort()).toEqual(['8001', '8004']);
    expect(await leggiCursoreCatalogo(db)).toBe('2026-09-17T07:00:00Z');
  });

  it('il catalogo completo sostituisce i prodotti ma conserva gli abbinamenti fatti in app', async () => {
    db = nuovoDb();
    await db.prodotti.put(prodotto('VECCHIO', 'Non più in catalogo'));
    await db.barcode.bulkPut([barcode('111', 'VECCHIO'), barcode('222', 'A1', { origine: 'app' })]);

    const { recupera } = fetchFinto(
      Response.json({
        aggiornatoIl: '2026-09-16T12:34:56Z',
        prodotti: [prodotto('A1', 'Scatola')],
        barcode: [],
        prodottiEliminati: [],
        barcodeEliminati: [],
      }),
    );
    await sincronizzaCatalogo({ db, impostazioni: connessione, recupera, adesso });

    expect((await db.prodotti.toArray()).map((p) => p.codice)).toEqual(['A1']);
    expect((await db.barcode.toArray()).map((b) => b.barcode)).toEqual(['222']);
  });

  it('non salva tombstone: i prodotti con eliminatoIl vengono tolti', async () => {
    db = nuovoDb();
    await db.prodotti.put(prodotto('X', 'Da togliere'));
    await db.impostazioni.put({ chiave: CHIAVE_CURSORE_CATALOGO, valore: '2026-09-16T00:00:00Z' });
    const { recupera } = fetchFinto(
      Response.json({
        aggiornatoIl: '2026-09-16T12:34:56Z',
        prodotti: [prodotto('X', 'Da togliere', { eliminatoIl: '2026-09-16T12:34:56Z' })],
        barcode: [],
        prodottiEliminati: [],
        barcodeEliminati: [],
      }),
    );
    await sincronizzaCatalogo({ db, impostazioni: connessione, recupera, adesso });
    expect(await db.prodotti.count()).toBe(0);
  });

  it('con URL vuoto usa la stessa origine della PWA', async () => {
    db = nuovoDb();
    const { recupera, chiamate } = fetchFinto(
      Response.json({
        aggiornatoIl: '2026-09-16T12:34:56Z',
        prodotti: [],
        barcode: [],
        prodottiEliminati: [],
        barcodeEliminati: [],
      }),
    );
    await sincronizzaCatalogo({
      db,
      impostazioni: { urlBridge: '', token: 't' },
      recupera,
      adesso,
    });
    expect(chiamate[0]?.url).toBe('/api/catalogo');
  });

  describe('errori: messaggio leggibile, nessuna modifica ai dati', () => {
    async function databaseConDati() {
      db = nuovoDb();
      await db.prodotti.put(prodotto('A1', 'Scatola'));
      await db.impostazioni.put({
        chiave: CHIAVE_CURSORE_CATALOGO,
        valore: '2026-09-16T00:00:00Z',
      });
    }

    async function verificaIntatto() {
      expect(await db.prodotti.count()).toBe(1);
      expect(await leggiCursoreCatalogo(db)).toBe('2026-09-16T00:00:00Z');
      expect(await db.impostazioni.get('ultimaSincronizzazione')).toBeUndefined();
    }

    it('senza token non chiama il bridge', async () => {
      await databaseConDati();
      const { recupera, chiamate } = fetchFinto();
      const esito = await sincronizzaCatalogo({
        db,
        impostazioni: { urlBridge: '', token: ' ' },
        recupera,
      });
      expect(esito).toEqual({
        ok: false,
        messaggio: 'Manca il token: inseriscilo nelle impostazioni.',
      });
      expect(chiamate).toHaveLength(0);
      await verificaIntatto();
    });

    it('rete assente', async () => {
      await databaseConDati();
      const { recupera } = fetchFinto(new TypeError('Failed to fetch'));
      const esito = await sincronizzaCatalogo({ db, impostazioni: connessione, recupera });
      expect(esito.ok).toBe(false);
      expect(!esito.ok && esito.messaggio).toMatch(/Bridge non raggiungibile/);
      await verificaIntatto();
    });

    it('token rifiutato', async () => {
      await databaseConDati();
      const { recupera } = fetchFinto(
        Response.json({ errore: 'Token non valido.' }, { status: 401 }),
      );
      const esito = await sincronizzaCatalogo({ db, impostazioni: connessione, recupera });
      expect(!esito.ok && esito.messaggio).toMatch(
        /^Token non valido: controllalo nelle impostazioni/,
      );
      await verificaIntatto();
    });

    it('errore del bridge con messaggio JSON', async () => {
      await databaseConDati();
      const { recupera } = fetchFinto(
        Response.json({ errore: 'La risposta conterrebbe troppi prodotti.' }, { status: 413 }),
      );
      const esito = await sincronizzaCatalogo({ db, impostazioni: connessione, recupera });
      expect(!esito.ok && esito.messaggio).toContain('La risposta conterrebbe troppi prodotti.');
      await verificaIntatto();
    });

    it('errore 500 con corpo non JSON', async () => {
      await databaseConDati();
      const { recupera } = fetchFinto(new Response('Internal error', { status: 500 }));
      const esito = await sincronizzaCatalogo({ db, impostazioni: connessione, recupera });
      expect(!esito.ok && esito.messaggio).toMatch(/errore 500/);
      await verificaIntatto();
    });

    it('risposta HTML invece di JSON (indirizzo sbagliato)', async () => {
      await databaseConDati();
      const { recupera } = fetchFinto(
        new Response('<!doctype html><html></html>', { status: 200 }),
      );
      const esito = await sincronizzaCatalogo({ db, impostazioni: connessione, recupera });
      expect(!esito.ok && esito.messaggio).toMatch(/non leggibile/);
      await verificaIntatto();
    });

    it('JSON con forma inattesa', async () => {
      await databaseConDati();
      const { recupera } = fetchFinto(Response.json({ prodotti: 'boh' }));
      const esito = await sincronizzaCatalogo({ db, impostazioni: connessione, recupera });
      expect(!esito.ok && esito.messaggio).toMatch(/formato inatteso/);
      await verificaIntatto();
    });
  });
});

describe('serveSyncAutomatica', () => {
  const base = {
    online: true,
    token: 'segreto',
    ultimaSincronizzazione: '2026-09-17T00:00:00.000Z',
    adesso: new Date('2026-09-17T08:00:00.000Z'),
  };

  it('sincronizza se sono passate più di 6 ore', () => {
    expect(serveSyncAutomatica(base)).toBe(true);
  });

  it('non sincronizza entro le 6 ore', () => {
    const recente = new Date(base.adesso.getTime() - INTERVALLO_SYNC_AUTOMATICA_MS).toISOString();
    expect(serveSyncAutomatica({ ...base, ultimaSincronizzazione: recente })).toBe(false);
  });

  it('sincronizza se non è mai stata fatta o la data è illeggibile', () => {
    expect(serveSyncAutomatica({ ...base, ultimaSincronizzazione: undefined })).toBe(true);
    expect(serveSyncAutomatica({ ...base, ultimaSincronizzazione: 'ieri' })).toBe(true);
  });

  it('non sincronizza offline o senza token', () => {
    expect(serveSyncAutomatica({ ...base, online: false })).toBe(false);
    expect(serveSyncAutomatica({ ...base, token: '' })).toBe(false);
  });

  it("sincronizza se l'orologio del telefono è tornato indietro", () => {
    expect(
      serveSyncAutomatica({ ...base, ultimaSincronizzazione: '2026-09-18T00:00:00.000Z' }),
    ).toBe(true);
  });
});
