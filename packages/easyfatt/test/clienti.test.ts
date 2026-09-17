import { describe, expect, it } from 'vitest';
import {
  analizzaClientiCsv,
  analizzaClientiTabella,
  ErroreTabellaClienti,
  leggiCsv,
} from '../src/index.js';
import easyfatt from './fixture/clienti-easyfatt-punto-e-virgola.csv?raw';
import minimo from './fixture/clienti-minimo.csv?raw';
import soggetti from './fixture/clienti-soggetti.csv?raw';
import virgola from './fixture/clienti-virgola.csv?raw';

const ORA = '2026-09-17T10:00:00.000Z';
const opzioni = { aggiornatoIl: ORA };

describe('leggiCsv', () => {
  it('divide in record e celle gestendo virgolette, a capo nei campi, BOM e CRLF', () => {
    const righe = leggiCsv('\uFEFFa;b\r\n"x;y";"con ""virgolette"" e\na capo"\r\n;\r\n');
    expect(righe).toEqual([
      ['a', 'b'],
      ['x;y', 'con "virgolette" e\na capo'],
      ['', ''],
    ]);
  });

  it('rileva il separatore ignorando quelli fra virgolette nell intestazione', () => {
    expect(leggiCsv('"Codice";"Nome, esteso";Nome\nK1;x;"Uno, due"')).toEqual([
      ['Codice', 'Nome, esteso', 'Nome'],
      ['K1', 'x', 'Uno, due'],
    ]);
    expect(leggiCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('un testo vuoto non ha righe; senza a capo finale l ultimo record c è lo stesso', () => {
    expect(leggiCsv('')).toEqual([]);
    expect(leggiCsv('a;b')).toEqual([['a', 'b']]);
  });
});

describe('analizzaClientiTabella', () => {
  it('legge l export Soggetti di Easyfatt con le intestazioni reali', () => {
    const { clienti, avvisi } = analizzaClientiTabella(leggiCsv(soggetti), opzioni);
    expect(avvisi).toEqual([]);
    expect(clienti).toEqual([
      {
        id: '1',
        codice: '1',
        nome: 'Imballaggi Prova Srl',
        origine: 'easyfatt',
        aggiornatoIl: ORA,
        indirizzo: 'Via Roma 1',
        cap: '47122',
        citta: 'Forlì',
        email: 'info@prova.it',
        // Excel aveva perso lo zero iniziale: torna a 11 cifre.
        partitaIva: '01234567890',
        codiceFiscale: '01234567890',
        provincia: 'FC',
        sdi: 'M5UXCR1',
        // Nessun telefono fisso: vale il cellulare.
        telefono: '333 1234567',
        listino: 2,
      },
      {
        id: '2',
        codice: '2',
        nome: 'Rossi Mario',
        origine: 'easyfatt',
        aggiornatoIl: ORA,
        nazione: 'Italia',
        codiceFiscale: 'RSSMRA80A01H501U',
        provincia: 'FC',
        telefono: '0543 111222',
      },
      {
        id: '3',
        codice: '3',
        nome: 'Verpackung GmbH',
        origine: 'easyfatt',
        aggiornatoIl: ORA,
        citta: 'Berlino',
        nazione: 'Germania',
        partitaIva: 'DE123456789',
      },
    ]);
  });

  it('toglie spazi, trattini e punti da partita IVA e codice fiscale', () => {
    // Casi dell'export reale (collaudo T10).
    const { clienti } = analizzaClientiTabella(
      [
        ['Cod.', 'Denominazione', 'Partita Iva', 'Codice fiscale'],
        ['1', 'Estero', 'us12-34-56789', 'rssmra 80a01 h501u'],
        ['2', 'Italia', '0123.456.789', ''],
      ],
      opzioni,
    );
    expect(clienti.map((c) => [c.partitaIva, c.codiceFiscale])).toEqual([
      ['US123456789', 'RSSMRA80A01H501U'],
      ['00123456789', undefined],
    ]);
  });

  it('ignora le righe vuote tenendo la numerazione di Excel', () => {
    const { clienti, avvisi } = analizzaClientiTabella(
      [
        ['Cod.', 'Denominazione'],
        [' ', ''],
        ['', ''],
        ['', 'Senza codice'],
        ['9', 'Ultimo'],
      ],
      opzioni,
    );
    expect(clienti.map((c) => c.codice)).toEqual(['9']);
    expect(avvisi).toEqual([
      'Colonna partita IVA non trovata nel file.',
      'Colonna codice fiscale non trovata nel file.',
      'Colonna città non trovata nel file.',
      'Colonna listino non trovata nel file.',
      'Riga 4: manca il codice, riga scartata.',
    ]);
  });

  it('senza aggiornatoIl usa l istante corrente', () => {
    const { clienti } = analizzaClientiTabella([
      ['Codice', 'Nome'],
      ['K1', 'Uno'],
    ]);
    expect(Number.isNaN(Date.parse(clienti[0]?.aggiornatoIl ?? ''))).toBe(false);
  });
});

describe('analizzaClientiCsv', () => {
  it('legge l export con punto e virgola, BOM, CRLF e virgolette', () => {
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
        indirizzo: "Via dell'Industria 14",
        cap: '47122',
        citta: 'Forlì',
        nazione: 'Italia',
        partitaIva: '01234567890',
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
        indirizzo: 'Piazza Saffi 1\r\nscala B',
        cap: '47121',
        citta: 'Forlì',
        nazione: 'Italia',
        partitaIva: '02345678901',
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
        citta: 'Cesena',
        partitaIva: '03456789012',
        provincia: 'FC',
      },
    ]);
    // I numeri sono quelli dei record (le righe di Excel), non delle righe di testo del file.
    expect(avvisi).toEqual([
      'Riga 4: manca il codice, riga scartata.',
      'Riga 6: codice C001 già presente alla riga 2, vale questa riga.',
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
        citta: 'Milano',
        email: 'info@nord.it',
        partitaIva: '04567890123',
        codiceFiscale: '04567890123',
        provincia: 'MI',
        sdi: 'ABC1234',
        telefono: '02 1234567',
      },
      {
        id: 'A11',
        codice: 'A11',
        nome: 'Neri Luca',
        origine: 'easyfatt',
        aggiornatoIl: ORA,
        citta: 'Como',
        codiceFiscale: 'NRELCU75B12F205Z',
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

  it.each([
    ['', 'Il file dei clienti è vuoto.'],
    ['\uFEFF\r\n\r\n', 'Il file dei clienti è vuoto.'],
    ['Nome;Città\nRossi;Forlì', 'Colonna del codice cliente non trovata'],
    ['Codice;Città\nK1;Forlì', 'Colonna del nome non trovata'],
    ['Codice;Nome\n', 'Il file non contiene nessun cliente valido.'],
    ['Codice;Nome\n;Senza codice', 'Il file non contiene nessun cliente valido.'],
  ])('rifiuta un file inutilizzabile (%#)', (testo, messaggio) => {
    const analizza = () => analizzaClientiCsv(testo, opzioni);
    expect(analizza).toThrow(ErroreTabellaClienti);
    expect(analizza).toThrow(messaggio);
  });
});
