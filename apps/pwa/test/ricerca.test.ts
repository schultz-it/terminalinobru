import { cercaProdotti } from '@terminalinobru/core';
import { afterEach, describe, expect, it } from 'vitest';
import type { DatabaseTerminalino } from '../src/db.js';
import { segmentiEvidenziati } from '../src/ricerca/evidenzia.js';
import {
  allInvalidazione,
  invalidaIndice,
  LIMITE_RISULTATI,
  ottieniIndice,
} from '../src/ricerca/indice.js';
import { nuovoDb, prodotto } from './aiuti.js';

let db: DatabaseTerminalino;
afterEach(async () => {
  invalidaIndice();
  await db?.delete();
});

describe('indice di ricerca in memoria', () => {
  it('cerca per codice e per descrizione sui prodotti di Dexie', async () => {
    db = nuovoDb();
    await db.prodotti.bulkPut([
      prodotto('SC-40', 'Scatola cartone 40x30'),
      prodotto('NA-01', 'Nastro adesivo avana'),
      prodotto('PB-10', 'Pluriball rotolo'),
    ]);
    const indice = await ottieniIndice(db);
    expect(cercaProdotti(indice, 'sc').map((p) => p.codice)).toEqual(['SC-40']);
    expect(cercaProdotti(indice, 'adesivo').map((p) => p.codice)).toEqual(['NA-01']);
  });

  it('riusa la cache finché non viene invalidata dopo la sync', async () => {
    db = nuovoDb();
    await db.prodotti.put(prodotto('A1', 'Scatola'));
    const primo = await ottieniIndice(db);
    await db.prodotti.put(prodotto('B2', 'Scatola piccola'));
    expect(await ottieniIndice(db)).toBe(primo);
    expect(cercaProdotti(primo, 'scatola')).toHaveLength(1);

    let avvisi = 0;
    const annulla = allInvalidazione(() => (avvisi += 1));
    invalidaIndice();
    annulla();

    const secondo = await ottieniIndice(db);
    expect(avvisi).toBe(1);
    expect(secondo).not.toBe(primo);
    expect(cercaProdotti(secondo, 'scatola')).toHaveLength(2);
  });

  it('limita i risultati a 30', async () => {
    db = nuovoDb();
    await db.prodotti.bulkPut(
      Array.from({ length: 50 }, (_, i) => prodotto(`S${String(i).padStart(2, '0')}`, 'Scatola')),
    );
    const indice = await ottieniIndice(db);
    expect(cercaProdotti(indice, 'scatola', LIMITE_RISULTATI)).toHaveLength(30);
  });
});

describe('segmentiEvidenziati', () => {
  const evidenziati = (testo: string, query: string) =>
    segmentiEvidenziati(testo, query)
      .filter((s) => s.evidenziato)
      .map((s) => s.testo);

  it('evidenzia ogni token, senza distinguere maiuscole', () => {
    expect(evidenziati('Scatola cartone 40x30', 'CART 40')).toEqual(['cart', '40']);
  });

  it('ricompone il testo originale', () => {
    const testo = 'Nastro adesivo avana 50mm';
    expect(
      segmentiEvidenziati(testo, 'a')
        .map((s) => s.testo)
        .join(''),
    ).toBe(testo);
  });

  it('trova le lettere accentate e restituisce il testo con gli accenti', () => {
    expect(evidenziati('Busta Perché qualità', 'perche qualita')).toEqual(['Perché', 'qualità']);
  });

  it('unisce le corrispondenze sovrapposte', () => {
    expect(evidenziati('aaaa', 'aa')).toEqual(['aaaa']);
    expect(segmentiEvidenziati('abcabc', 'bc ab')).toEqual([
      { testo: 'abcabc', evidenziato: true },
    ]);
  });

  it('query vuota: niente evidenziato; testo vuoto: nessun segmento', () => {
    expect(segmentiEvidenziati('Scatola', '  ')).toEqual([
      { testo: 'Scatola', evidenziato: false },
    ]);
    expect(segmentiEvidenziati('', 'x')).toEqual([]);
  });
});
