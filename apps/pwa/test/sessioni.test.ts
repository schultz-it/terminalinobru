import type { Riga } from '@terminalinobru/core';
import { afterEach, describe, expect, it } from 'vitest';
import type { DatabaseTerminalino } from '../src/db.js';
import { testoFileTerminale } from '../src/sessioni/file.js';
import { generaUuid, nomeFileTerminale, nomeProposto } from '../src/sessioni/modello.js';
import {
  aggiungiRiga,
  cancellaRiga,
  chiudiSessione,
  creaSessione,
  modificaQuantita,
  pulisciSessioniImportate,
  riapriSessione,
  righeSessione,
  sessioneCompleta,
  sessioniDaPulire,
  totaleProdotto,
} from '../src/sessioni/operazioni.js';
import { leggiQuantita } from '../src/sessioni/quantita.js';
import { calcolaRiepilogo } from '../src/sessioni/riepilogo.js';
import { nuovoDb, prodotto } from './aiuti.js';

let db: DatabaseTerminalino;
afterEach(async () => {
  await db?.delete();
});

const adesso = new Date('2026-09-17T08:30:00.000Z');

async function inventarioAperto(modalita: 'chiedi_quantita' | 'somma_uno' = 'chiedi_quantita') {
  return creaSessione(db, { tipo: 'inventario', nome: 'Scaffale A', modalita }, adesso);
}

describe('nomi e identificativi', () => {
  it('propone "<Tipo> <data> <ora>" in ora locale', () => {
    const data = new Date(2026, 8, 7, 9, 5);
    expect(nomeProposto('inventario', data)).toBe('Inventario 07/09/2026 09:05');
    expect(nomeProposto('ddt', data)).toBe('DDT 07/09/2026 09:05');
    expect(nomeProposto('carico', data)).toBe('Carico 07/09/2026 09:05');
  });

  it('dà al file un nome senza accenti né spazi', () => {
    expect(nomeFileTerminale('inventario', 'Scaffale À / 1', new Date(2026, 8, 17))).toBe(
      'terminale-inventario-scaffale-a-1-20260917.txt',
    );
    expect(nomeFileTerminale('ddt', '***', new Date(2026, 0, 2))).toBe(
      'terminale-ddt-sessione-20260102.txt',
    );
  });

  it('genera UUID v4', () => {
    expect(generaUuid()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

describe('leggiQuantita', () => {
  it('accetta interi e decimali con virgola o punto', () => {
    expect(leggiQuantita('12')).toEqual({ tipo: 'ok', valore: 12 });
    expect(leggiQuantita('1,5')).toEqual({ tipo: 'ok', valore: 1.5 });
    expect(leggiQuantita('0.125')).toEqual({ tipo: 'ok', valore: 0.125 });
    expect(leggiQuantita(',5')).toEqual({ tipo: 'ok', valore: 0.5 });
    expect(leggiQuantita('3,')).toEqual({ tipo: 'ok', valore: 3 });
  });

  it('tratta lo zero a parte, perché va confermato', () => {
    expect(leggiQuantita('0')).toEqual({ tipo: 'zero' });
    expect(leggiQuantita('0,000')).toEqual({ tipo: 'zero' });
  });

  it('rifiuta vuoto, negativi, testo e troppi decimali', () => {
    expect(leggiQuantita('')).toMatchObject({ tipo: 'errore' });
    expect(leggiQuantita('-2')).toEqual({
      tipo: 'errore',
      messaggio: 'La quantità non può essere negativa.',
    });
    expect(leggiQuantita('12a')).toMatchObject({ tipo: 'errore' });
    expect(leggiQuantita('1,2,3')).toMatchObject({ tipo: 'errore' });
    expect(leggiQuantita('1,2345')).toEqual({
      tipo: 'errore',
      messaggio: 'Al massimo 3 decimali.',
    });
  });
});

describe('righe di una sessione', () => {
  it('aggiunge, modifica e cancella righe tenendo il progressivo', async () => {
    db = nuovoDb();
    const sessione = await inventarioAperto();
    expect(sessione).toMatchObject({ stato: 'aperta', creataIl: adesso.toISOString() });

    const r1 = await aggiungiRiga(db, sessione.id, {
      codiceProdotto: 'A1',
      quantita: 5,
      barcodeLetto: '8001',
    });
    const r2 = await aggiungiRiga(db, sessione.id, { codiceProdotto: 'B2', quantita: 2.5 });
    const r3 = await aggiungiRiga(db, sessione.id, { codiceProdotto: 'A1', quantita: 3 });
    expect([r1.ordine, r2.ordine, r3.ordine]).toEqual([1, 2, 3]);
    expect(r1.barcodeLetto).toBe('8001');
    expect(r2).not.toHaveProperty('barcodeLetto');
    expect(await totaleProdotto(db, sessione.id, 'A1')).toBe(8);

    await modificaQuantita(db, r1.id, 7);
    expect(await totaleProdotto(db, sessione.id, 'A1')).toBe(10);

    await cancellaRiga(db, r3.id);
    const righe = await righeSessione(db, sessione.id);
    expect(righe.map((r) => [r.codiceProdotto, r.quantita])).toEqual([
      ['A1', 7],
      ['B2', 2.5],
    ]);

    // Dopo una cancellazione il progressivo continua dall'ultima riga rimasta, senza doppioni.
    const r4 = await aggiungiRiga(db, sessione.id, { codiceProdotto: 'C3', quantita: 1 });
    expect(r4.ordine).toBe(3);
  });

  it('non accetta quantità negative o non numeriche, ammette lo zero', async () => {
    db = nuovoDb();
    const sessione = await inventarioAperto();
    await expect(
      aggiungiRiga(db, sessione.id, { codiceProdotto: 'A1', quantita: -1 }),
    ).rejects.toThrow('Quantità non valida');
    await expect(
      aggiungiRiga(db, sessione.id, { codiceProdotto: 'A1', quantita: Number.NaN }),
    ).rejects.toThrow('Quantità non valida');
    const zero = await aggiungiRiga(db, sessione.id, { codiceProdotto: 'A1', quantita: 0 });
    await expect(modificaQuantita(db, zero.id, -3)).rejects.toThrow('Quantità non valida');
    expect(await db.righe.count()).toBe(1);
  });

  it('una sessione chiusa non si modifica finché non viene riaperta', async () => {
    db = nuovoDb();
    const sessione = await inventarioAperto();
    const riga = await aggiungiRiga(db, sessione.id, { codiceProdotto: 'A1', quantita: 1 });
    await chiudiSessione(db, sessione.id, adesso);

    await expect(
      aggiungiRiga(db, sessione.id, { codiceProdotto: 'A1', quantita: 1 }),
    ).rejects.toThrow('chiusa');
    await expect(modificaQuantita(db, riga.id, 4)).rejects.toThrow('chiusa');
    await expect(cancellaRiga(db, riga.id)).rejects.toThrow('chiusa');

    await riapriSessione(db, sessione.id);
    await modificaQuantita(db, riga.id, 4);
    expect((await db.righe.get(riga.id))?.quantita).toBe(4);
  });
});

describe('chiusura e riapertura', () => {
  it('non chiude una sessione vuota', async () => {
    db = nuovoDb();
    const sessione = await inventarioAperto();
    await expect(chiudiSessione(db, sessione.id)).rejects.toThrow('vuota');
    expect((await db.sessioni.get(sessione.id))?.stato).toBe('aperta');
    expect(await db.codaUpload.count()).toBe(0);
  });

  it('chiude, accoda una volta sola e alla riapertura toglie la voce dalla coda', async () => {
    db = nuovoDb();
    const sessione = await creaSessione(
      db,
      {
        tipo: 'ddt',
        nome: ' Cliente Rossi ',
        note: '  ',
        modalita: 'somma_uno',
        dispositivo: 'Tel 1',
      },
      adesso,
    );
    expect(sessione.nome).toBe('Cliente Rossi');
    expect(sessione).not.toHaveProperty('note');
    await aggiungiRiga(db, sessione.id, { codiceProdotto: 'A1', quantita: 1 });

    const chiusura = new Date('2026-09-17T09:00:00.000Z');
    await chiudiSessione(db, sessione.id, chiusura);
    await expect(chiudiSessione(db, sessione.id, chiusura)).rejects.toThrow('non è aperta');

    const completa = await sessioneCompleta(db, sessione.id);
    expect(completa).toMatchObject({
      stato: 'chiusa',
      chiusaIl: chiusura.toISOString(),
      dispositivo: 'Tel 1',
      righe: [{ codiceProdotto: 'A1', quantita: 1, ordine: 1 }],
    });
    expect(await db.codaUpload.toArray()).toMatchObject([
      { tipo: 'sessione', riferimento: sessione.id, tentativi: 0 },
    ]);

    await riapriSessione(db, sessione.id);
    const riaperta = await db.sessioni.get(sessione.id);
    expect(riaperta?.stato).toBe('aperta');
    expect(riaperta).not.toHaveProperty('chiusaIl');
    expect(await db.codaUpload.count()).toBe(0);

    await chiudiSessione(db, sessione.id, chiusura);
    expect(await db.codaUpload.count()).toBe(1);
  });

  it('non riapre sessioni esportate o importate', async () => {
    db = nuovoDb();
    const sessione = await inventarioAperto();
    await db.sessioni.update(sessione.id, { stato: 'esportata' });
    await expect(riapriSessione(db, sessione.id)).rejects.toThrow('Si può riaprire');
  });
});

describe('pulizia delle sessioni importate', () => {
  it('cancella solo le importate chiuse da più di 90 giorni, con righe e coda', async () => {
    db = nuovoDb();
    const oggi = new Date('2026-12-31T12:00:00.000Z');
    const vecchia = await inventarioAperto();
    const recente = await inventarioAperto();
    const chiusaVecchia = await inventarioAperto();
    for (const s of [vecchia, recente, chiusaVecchia]) {
      await aggiungiRiga(db, s.id, { codiceProdotto: 'A1', quantita: 1 });
    }
    await db.sessioni.update(vecchia.id, {
      stato: 'importata',
      chiusaIl: '2026-09-01T10:00:00.000Z',
    });
    await db.sessioni.update(recente.id, {
      stato: 'importata',
      chiusaIl: '2026-10-15T10:00:00.000Z',
    });
    await db.sessioni.update(chiusaVecchia.id, {
      stato: 'chiusa',
      chiusaIl: '2026-01-01T10:00:00.000Z',
    });
    await db.codaUpload.add({
      tipo: 'sessione',
      riferimento: vecchia.id,
      creataIl: '',
      tentativi: 3,
    });

    expect((await sessioniDaPulire(db, oggi)).map((s) => s.id)).toEqual([vecchia.id]);
    expect(await pulisciSessioniImportate(db, oggi)).toBe(1);

    expect(await db.sessioni.get(vecchia.id)).toBeUndefined();
    expect(await db.righe.where('sessioneId').equals(vecchia.id).count()).toBe(0);
    expect(await db.codaUpload.count()).toBe(0);
    expect(await db.sessioni.count()).toBe(2);
    expect(await db.righe.count()).toBe(2);
    expect(await pulisciSessioniImportate(db, oggi)).toBe(0);
  });
});

describe('riepilogo ed export', () => {
  it('aggrega per prodotto e segnala le differenze dalla giacenza per l’inventario', () => {
    const righe: Riga[] = [
      riga(1, 'A1', 5),
      riga(2, 'B2', 1.25),
      riga(3, 'A1', 5),
      riga(4, 'C3', 2),
      riga(5, 'B2', 0.75),
    ];
    const prodotti = new Map([
      ['A1', prodotto('A1', 'Scatola', { giacenza: 10 })],
      ['B2', prodotto('B2', 'Nastro', { giacenza: 4 })],
      ['C3', prodotto('C3', 'Pluriball')],
    ]);

    const riepilogo = calcolaRiepilogo('inventario', righe, prodotti);
    expect(riepilogo).toEqual({
      voci: [
        {
          codice: 'A1',
          descrizione: 'Scatola',
          quantita: 10,
          righe: 2,
          giacenza: 10,
          differenza: 0,
        },
        { codice: 'B2', descrizione: 'Nastro', quantita: 2, righe: 2, giacenza: 4, differenza: -2 },
        { codice: 'C3', descrizione: 'Pluriball', quantita: 2, righe: 1 },
      ],
      totaleRighe: 5,
      totalePezzi: 14,
      vociConDifferenza: 1,
      vociSenzaGiacenza: 1,
    });

    // Per DDT e carico la giacenza non conta.
    const ddt = calcolaRiepilogo('ddt', righe, prodotti);
    expect(ddt.voci[0]).toEqual({ codice: 'A1', descrizione: 'Scatola', quantita: 10, righe: 2 });
    expect(ddt.vociConDifferenza).toBe(0);
  });

  it('inventario di 20 letture con 3 prodotti ripetuti: file con 3 righe e somme corrette', async () => {
    db = nuovoDb();
    const sessione = await inventarioAperto();
    // A = A1 da 2 pezzi (8 letture), B = B2 da 1,5 (8 letture), C = C3 da 10 (4 letture).
    const sequenza = 'ABACBABCAABBCABACBAB';
    const letture: Record<string, [string, number]> = {
      A: ['A1', 2],
      B: ['B2', 1.5],
      C: ['C3', 10],
    };
    expect(sequenza).toHaveLength(20);
    for (const lettera of sequenza) {
      const [codiceProdotto, quantita] = letture[lettera]!;
      await aggiungiRiga(db, sessione.id, {
        codiceProdotto,
        quantita,
        barcodeLetto: `800${lettera}`,
      });
    }
    const righe = await righeSessione(db, sessione.id);

    // Una riga per prodotto, nell'ordine di prima comparsa: 8×2, 8×1,5, 4×10.
    expect(testoFileTerminale(righe, { stringaFormato: 'A,Q', separatoreDecimale: '.' })).toBe(
      'A1,16\r\nB2,12\r\nC3,40\r\n',
    );

    const riepilogo = calcolaRiepilogo('inventario', righe, new Map());
    expect(riepilogo.totaleRighe).toBe(20);
    expect(riepilogo.totalePezzi).toBe(68);
    expect(riepilogo.voci.map((v) => [v.codice, v.quantita, v.righe])).toEqual([
      ['A1', 16, 8],
      ['B2', 12, 8],
      ['C3', 40, 4],
    ]);
  });

  it('usa separatore decimale e stringa formato delle impostazioni locali', () => {
    const righe = [riga(1, 'A1', 1.5), riga(2, 'A1', 1)];
    expect(testoFileTerminale(righe, { stringaFormato: 'A;Q', separatoreDecimale: ',' })).toBe(
      'A1;2,5\r\n',
    );
    expect(() =>
      testoFileTerminale(righe, { stringaFormato: 'Z', separatoreDecimale: '.' }),
    ).toThrow();
  });
});

function riga(ordine: number, codiceProdotto: string, quantita: number): Riga {
  return {
    id: `r${ordine}`,
    sessioneId: 's1',
    codiceProdotto,
    quantita,
    lettaIl: adesso.toISOString(),
    ordine,
  };
}
