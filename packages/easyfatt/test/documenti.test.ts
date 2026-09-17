import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { describe, expect, it } from 'vitest';
import {
  ErroreDocumenti,
  formattaQuantita,
  generaDocumentiVuoto,
  generaDocumentiXml,
  type DocumentoOrdine,
} from '../src/index.js';
import ordiniAttesi from './fixture/documenti-ordini.xml?raw';

const DOCUMENTI: DocumentoOrdine[] = [
  {
    numero: 41,
    // 22:30 UTC è già il giorno dopo a Roma.
    data: new Date('2026-09-17T22:30:00Z'),
    cliente: {
      codice: 'C001',
      nome: 'Rossi & Figli <Imballaggi> S.r.l.',
      partitaIva: '01234567890',
      codiceFiscale: '01234567890',
      indirizzo: "Via dell'Industria 12",
      cap: '47122',
      citta: 'Forlì',
      provincia: 'FC',
      nazione: 'Italia',
      sdi: 'M5UXCR1',
      telefono: '0543 123456',
      email: 'ordini@rossi.it',
    },
    commento: 'Sessione "Scaffale A" dal telefono',
    righe: [
      { codice: 'FILM500', descrizione: 'Film estensibile 500 mm', quantita: 2.5, um: 'rt' },
      { codice: '+banp_1200800p', quantita: 172 },
    ],
  },
  {
    numero: 42,
    data: new Date('2026-09-18T08:00:00Z'),
    cliente: {
      nome: 'Bianchi Mario',
      codiceFiscale: 'BNCMRA80A01D704X',
      email: 'mario@bianchi.it',
      sdi: 'mario.bianchi@pec.it',
    },
    righe: [
      { codice: 'NASTRO48', descrizione: 'Nastro adesivo 48 mm', quantita: 0.1 + 0.2, um: 'pz' },
    ],
  },
];

/** Documento minimo da variare nei test degli errori. */
const MINIMO: DocumentoOrdine = {
  numero: 1,
  data: new Date('2026-09-17T10:00:00Z'),
  cliente: { nome: 'Bianchi' },
  righe: [{ codice: 'A', quantita: 1 }],
};

describe('generaDocumentiXml', () => {
  it('coincide carattere per carattere con la fixture attesa', () => {
    expect(generaDocumentiXml(DOCUMENTI, { listino: 'Rivenditori' })).toBe(ordiniAttesi);
  });

  it('produce un XML ben formato con la struttura del tracciato Danea', () => {
    expect(XMLValidator.validate(ordiniAttesi)).toBe(true);
    const letto = new XMLParser({ ignoreAttributes: false, parseTagValue: false }).parse(
      ordiniAttesi,
    ) as {
      EasyfattDocuments: {
        '@_AppVersion': string;
        Documents: { Document: { CustomerName: string; Rows: { Row: unknown } }[] };
      };
    };
    const radice = letto.EasyfattDocuments;
    expect(radice['@_AppVersion']).toBe('2');
    expect(radice.Documents.Document).toHaveLength(2);
    expect(radice.Documents.Document[0]?.CustomerName).toBe('Rossi & Figli <Imballaggi> S.r.l.');
    expect(ordiniAttesi).not.toContain('<Price>');
  });

  it('senza listino non scrive PriceList, senza codice non scrive CustomerCode', () => {
    const xml = generaDocumentiXml([MINIMO]);
    expect(xml).not.toContain('PriceList');
    expect(xml).not.toContain('CustomerCode');
    expect(xml).not.toContain('InternalComment');
    expect(xml).toContain('<Date>2026-09-17</Date>');
  });

  it('salta i campi vuoti e toglie i caratteri non ammessi in XML', () => {
    const controllo = String.fromCharCode(1, 11);
    const xml = generaDocumentiXml([
      { ...MINIMO, cliente: { nome: `Bianchi${controllo}`, citta: '  ' }, commento: '' },
    ]);
    expect(xml).toContain('<CustomerName>Bianchi</CustomerName>');
    expect(xml).not.toContain('CustomerCity');
    expect(xml).not.toContain('InternalComment');
  });

  it('usa il fuso orario indicato', () => {
    const xml = generaDocumentiXml([{ ...MINIMO, data: new Date('2026-09-17T22:30:00Z') }], {
      fusoOrario: 'UTC',
    });
    expect(xml).toContain('<Date>2026-09-17</Date>');
  });

  it('con l elenco vuoto coincide con generaDocumentiVuoto', () => {
    const vuoto =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<EasyfattDocuments AppVersion="2" Creator="TerminalinoBru" CreatorUrl="">\n' +
      '  <Documents></Documents>\n' +
      '</EasyfattDocuments>';
    expect(generaDocumentiXml([])).toBe(vuoto);
    expect(generaDocumentiVuoto()).toBe(vuoto);
  });

  it.each([
    [{ ...MINIMO, numero: 0 }, 'Numero documento non valido: 0. Serve un intero da 1 in su.'],
    [{ ...MINIMO, numero: 1.5 }, 'Numero documento non valido: 1.5. Serve un intero da 1 in su.'],
    [{ ...MINIMO, cliente: { nome: ' ' } }, 'Il documento 1 non ha il nome del cliente.'],
    [{ ...MINIMO, data: new Date('non una data') }, 'Data non valida nel documento 1.'],
    [
      {
        ...MINIMO,
        righe: [
          { codice: 'A', quantita: 1 },
          { codice: '', quantita: 1 },
        ],
      },
      'Riga 2 del documento 1 senza codice prodotto.',
    ],
    [{ ...MINIMO, righe: [{ codice: 'A', quantita: Number.NaN }] }, 'Quantità non valida: NaN.'],
  ])('rifiuta un documento non valido (%#)', (doc, messaggio) => {
    const genera = () => generaDocumentiXml([doc]);
    expect(genera).toThrow(ErroreDocumenti);
    expect(genera).toThrow(messaggio);
  });
});

describe('formattaQuantita', () => {
  it.each([
    [17, '17'],
    [2.5, '2.5'],
    [2.5004, '2.5'],
    [1.2346, '1.235'],
    [0.1 + 0.2, '0.3'],
    [100, '100'],
    [-3.25, '-3.25'],
    [-0.0001, '0'],
    [0, '0'],
  ])('%s → %s', (quantita, atteso) => {
    expect(formattaQuantita(quantita)).toBe(atteso);
  });

  it('rifiuta infinito', () => {
    expect(() => formattaQuantita(Number.POSITIVE_INFINITY)).toThrow(ErroreDocumenti);
  });
});
