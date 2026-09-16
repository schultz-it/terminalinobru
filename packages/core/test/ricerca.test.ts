import { describe, expect, it } from 'vitest';
import { cercaProdotti, costruisciIndice, normalizza } from '../src/index.js';
import { prodotto } from './aiuti.js';

const prodotti = [
  prodotto('+banp_1200800p', 'Bancale in plastica 1200x800'),
  prodotto('+ban12008006a', 'Bancale in legno 1200x800 a 6 assi'),
  prodotto('FILM500', 'Film estensibile 500 mm trasparente'),
  prodotto('SCAT-30', 'Scatola cartone 30x20x15 già stampata'),
  prodotto('OBS1', 'Prodotto eliminato', { eliminatoIl: '2026-09-10T08:00:00.000Z' }),
];
const indice = costruisciIndice(prodotti);

describe('normalizza', () => {
  it('abbassa le maiuscole e toglie gli accenti', () => {
    expect(normalizza('PERCHÉ È così')).toBe('perche e cosi');
  });

  it('comprime gli spazi e taglia quelli ai bordi', () => {
    expect(normalizza('  film    500 \n mm ')).toBe('film 500 mm');
  });

  it('lascia intatti i simboli dei codici', () => {
    expect(normalizza('+BANP_1200800P')).toBe('+banp_1200800p');
  });

  it('su stringa vuota restituisce stringa vuota', () => {
    expect(normalizza('   ')).toBe('');
  });
});

describe('costruisciIndice', () => {
  it('esclude i prodotti eliminati', () => {
    expect(indice.voci).toHaveLength(4);
    expect(indice.voci.map((v) => v.prodotto.codice)).not.toContain('OBS1');
  });
});

describe('cercaProdotti', () => {
  it('query vuota o di soli spazi non restituisce nulla', () => {
    expect(cercaProdotti(indice, '')).toEqual([]);
    expect(cercaProdotti(indice, '   ')).toEqual([]);
  });

  it('limite non positivo non restituisce nulla', () => {
    expect(cercaProdotti(indice, 'bancale', 0)).toEqual([]);
  });

  it('trova per prefisso di codice con simboli', () => {
    const trovati = cercaProdotti(indice, '+banp');
    expect(trovati.map((p) => p.codice)).toEqual(['+banp_1200800p']);
  });

  it('trova un codice completo con underscore e cifre', () => {
    expect(cercaProdotti(indice, '+banp_1200800p').map((p) => p.codice)).toEqual([
      '+banp_1200800p',
    ]);
  });

  it('richiede tutti i token in AND su codice e descrizione', () => {
    expect(cercaProdotti(indice, 'bancale legno').map((p) => p.codice)).toEqual(['+ban12008006a']);
    expect(cercaProdotti(indice, 'bancale acciaio')).toEqual([]);
  });

  it('ignora accenti e maiuscole della query e della descrizione', () => {
    expect(cercaProdotti(indice, 'GIÀ stampata').map((p) => p.codice)).toEqual(['SCAT-30']);
    expect(cercaProdotti(indice, 'gia').map((p) => p.codice)).toEqual(['SCAT-30']);
  });

  it('mette prima i prefissi di codice e poi le descrizioni', () => {
    const trovati = cercaProdotti(indice, 'film');
    expect(trovati.map((p) => p.codice)).toEqual(['FILM500']);
    const misti = cercaProdotti(indice, '1200800');
    expect(misti.map((p) => p.codice)).toEqual(['+ban12008006a', '+banp_1200800p']);
  });

  it('rispetta il limite di risultati', () => {
    expect(cercaProdotti(indice, 'bancale', 1)).toHaveLength(1);
    expect(cercaProdotti(indice, 'bancale')).toHaveLength(2);
  });

  it('non trova i prodotti eliminati', () => {
    expect(cercaProdotti(indice, 'eliminato')).toEqual([]);
  });
});
