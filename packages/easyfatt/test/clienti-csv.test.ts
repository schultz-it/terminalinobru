import { describe, expect, it } from 'vitest';
import { analizzaClientiCsv, ErroreClientiCsv } from '../src/index.js';
import easyfatt from './fixture/clienti-easyfatt-punto-e-virgola.csv?raw';
import minimo from './fixture/clienti-minimo.csv?raw';
import virgola from './fixture/clienti-virgola.csv?raw';

const ORA = '2026-09-17T10:00:00.000Z';
const opzioni = { aggiornatoIl: ORA };

describe('analizzaClientiCsv', () => {
  it('legge l export di Easyfatt con punto e virgola, BOM, CRLF e virgolette', () => {
    expect(easyfatt.charCodeAt(0)).toBe(0xfeff);
    expect(easyfatt).toContain('\r\n');
    const { clienti, avvisi } = analizzaClientiCsv(easyfatt, opzioni);
    expect(clienti).toEqual([
      {
        id: 'C001',
        codice: 'C001',
        nome: 'Rossi & Figli Imballaggi S.r.l.',
        origine: 'easyfatt',
        aggiornatoIl: ORA,
        partitaIva: '01234567890',
        indirizzo: "Via dell'Industria 14",
        cap: '47122',
        citta: 'Forlì',
        nazione: 'Italia',
        provincia: 'FC',
        sdi: 'M5UXCR1',
        listino: 2,
      },
      {
        id: 'C002',
        codice: 'C002',
        nome: 'Bar "Da Gino"',
        origine: 'easyfatt',
        aggiornatoIl: ORA,
        partitaIva: '02345678901',
        indirizzo: 'Piazza Saffi 1\r\nscala B',
        cap: '47121',
        citta: 'Forlì',
        nazione: 'Italia',
        provincia: 'FC',
        sdi: 'gino@pec.it',
        listino: 3,
      },
      {
        id: 'C003',
        codice: 'C003',
        nome: 'Verdi snc',
        origine: 'easyfatt',
        aggiornatoIl: ORA,
        partitaIva: '03456789012',
        citta: 'Cesena',
        provincia: 'FC',
      },
    ]);
    expect(avvisi).toEqual([
      'Riga 5: manca il codice, riga scartata.',
      'Riga 7: codice C001 già presente alla riga 2, vale questa riga.',
    ]);
  });

  it('legge un CSV con la virgola e intestazioni alternative', () => {
    const { clienti, avvisi } = analizzaClientiCsv(virgola, opzioni);
    expect(clienti).toEqual([
      {
        id: 'A10',
        codice: 'A10',
        nome: 'Imballaggi Nord, S.p.A.',
        origine: 'easyfatt',
        aggiornatoIl: ORA,
        partitaIva: '04567890123',
        codiceFiscale: '04567890123',
        citta: 'Milano',
        telefono: '02 1234567',
        email: 'info@nord.it',
        provincia: 'MI',
        sdi: 'ABC1234',
      },
      {
        id: 'A11',
        codice: 'A11',
        nome: 'Neri Luca',
        origine: 'easyfatt',
        aggiornatoIl: ORA,
        codiceFiscale: 'NRELCU75B12F205Z',
        citta: 'Como',
        provincia: 'CO',
      },
    ]);
    expect(avvisi).toEqual([
      'Colonna listino non trovata nel file.',
      'Riga 4: manca il nome, riga scartata.',
    ]);
  });

  it('legge un CSV con le sole colonne di codice e nome', () => {
    const { clienti, avvisi } = analizzaClientiCsv(minimo, opzioni);
    expect(clienti.map((c) => [c.id, c.nome])).toEqual([
      ['K1', 'Cliente uno'],
      ['K2', 'Cliente; due'],
    ]);
    expect(avvisi).toEqual([
      'Colonna partita IVA non trovata nel file.',
      'Colonna codice fiscale non trovata nel file.',
      'Colonna città non trovata nel file.',
      'Colonna listino non trovata nel file.',
    ]);
  });

  it('preferisce Denominazione a Nome e ignora un listino non numerico', () => {
    const { clienti } = analizzaClientiCsv(
      'Nome;Codice;Denominazione;Listino\nMario;X1;Rossi Mario srl;Listino 10\n',
      opzioni,
    );
    expect(clienti[0]?.nome).toBe('Rossi Mario srl');
    expect(clienti[0]?.listino).toBeUndefined();
  });

  it('rileva il separatore ignorando quelli fra virgolette nell intestazione', () => {
    const { clienti } = analizzaClientiCsv(
      '"Codice";"Nome, esteso";Nome\nK1;x;"Uno, due"',
      opzioni,
    );
    expect(clienti[0]?.nome).toBe('Uno, due');
  });

  it('senza aggiornatoIl usa l istante corrente', () => {
    const { clienti } = analizzaClientiCsv('Codice;Nome\nK1;Uno');
    expect(Number.isNaN(Date.parse(clienti[0]?.aggiornatoIl ?? ''))).toBe(false);
  });

  it.each([
    ['', 'Il file dei clienti è vuoto.'],
    ['﻿\r\n\r\n', 'Il file dei clienti è vuoto.'],
    ['Nome;Città\nRossi;Forlì', 'Colonna del codice cliente non trovata'],
    ['Codice;Città\nK1;Forlì', 'Colonna del nome non trovata'],
    ['Codice;Nome\n', 'Il file non contiene nessun cliente valido.'],
    ['Codice;Nome\n;Senza codice', 'Il file non contiene nessun cliente valido.'],
  ])('rifiuta un file inutilizzabile (%#)', (testo, messaggio) => {
    const analizza = () => analizzaClientiCsv(testo, opzioni);
    expect(analizza).toThrow(ErroreClientiCsv);
    expect(analizza).toThrow(messaggio);
  });
});
