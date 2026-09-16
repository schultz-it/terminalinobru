import { describe, expect, it } from 'vitest';
import { aggregaRighe, arrotondaQuantita } from '../src/index.js';
import { riga } from './aiuti.js';

describe('aggregaRighe', () => {
  it('senza righe non produce risultati', () => {
    expect(aggregaRighe([])).toEqual([]);
  });

  it('somma le quantità per codice mantenendo l ordine di prima comparsa', () => {
    const righe = [
      riga('FILM500', 2, 0),
      riga('+banp_1200800p', 10, 1),
      riga('FILM500', 3, 2),
      riga('+banp_1200800p', 7, 3),
    ];
    expect(aggregaRighe(righe)).toEqual([
      { codice: 'FILM500', quantita: 5 },
      { codice: '+banp_1200800p', quantita: 17 },
    ]);
  });

  it('ordina per campo ordine anche se le righe arrivano mescolate', () => {
    const righe = [riga('B', 1, 3), riga('A', 1, 1), riga('C', 1, 2)];
    expect(aggregaRighe(righe).map((r) => r.codice)).toEqual(['A', 'C', 'B']);
  });

  it('somma quantità decimali senza errori di virgola mobile', () => {
    const righe = [riga('FILM500', 0.1, 0), riga('FILM500', 0.2, 1)];
    expect(aggregaRighe(righe)).toEqual([{ codice: 'FILM500', quantita: 0.3 }]);
  });

  it('accetta quantità negative (resi e rettifiche in meno)', () => {
    const righe = [riga('FILM500', 5, 0), riga('FILM500', -2.5, 1)];
    expect(aggregaRighe(righe)).toEqual([{ codice: 'FILM500', quantita: 2.5 }]);
  });

  it('arrotonda ai 3 decimali del file terminalino', () => {
    expect(arrotondaQuantita(1.23456)).toBe(1.235);
    expect(arrotondaQuantita(2)).toBe(2);
  });
});
