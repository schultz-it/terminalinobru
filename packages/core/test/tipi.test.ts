import { describe, expect, it } from 'vitest';
import {
  IMPOSTAZIONI_DEFAULT,
  NUMERO_LISTINI,
  prezziVuoti,
  schemaBarcode,
  schemaImpostazioni,
  schemaProdotto,
  schemaRiga,
  schemaSessione,
} from '../src/index.js';

describe('valori di default', () => {
  it('le impostazioni partono da A,Q con punto decimale', () => {
    expect(IMPOSTAZIONI_DEFAULT).toEqual({
      urlBridge: '',
      token: '',
      stringaFormato: 'A,Q',
      separatoreDecimale: '.',
      listinoMostrato: 1,
      modalitaPredefinita: 'chiedi_quantita',
      suoni: true,
      vibrazione: true,
      dispositivo: '',
    });
  });

  it('i listini vuoti sono nove NaN', () => {
    const prezzi = prezziVuoti();
    expect(prezzi).toHaveLength(NUMERO_LISTINI);
    expect(prezzi.every((p) => Number.isNaN(p))).toBe(true);
  });

  it('rifiuta un listino mostrato fuori intervallo', () => {
    expect(schemaImpostazioni.safeParse({ listinoMostrato: 0 }).success).toBe(false);
    expect(schemaImpostazioni.safeParse({ listinoMostrato: 10 }).success).toBe(false);
  });
});

describe('schemaProdotto', () => {
  it('riempie i default di listini e gestione magazzino', () => {
    const p = schemaProdotto.parse({
      codice: 'FILM500',
      descrizione: 'Film estensibile',
      aggiornatoIl: '2026-09-16T10:00:00.000Z',
    });
    expect(p.gestioneMagazzino).toBe(true);
    expect(p.prezziNetti).toHaveLength(NUMERO_LISTINI);
    expect(p.ivaPerc).toBeUndefined();
  });

  it('accetta NaN nei listini assenti', () => {
    const p = schemaProdotto.parse({
      codice: 'A',
      descrizione: 'B',
      aggiornatoIl: '2026-09-16T10:00:00.000Z',
      prezziNetti: [30.33, Number.NaN],
      prezziLordi: [37, Number.NaN],
    });
    expect(Number.isNaN(p.prezziNetti[1])).toBe(true);
  });

  it('rifiuta un prodotto senza codice', () => {
    const esito = schemaProdotto.safeParse({
      codice: '',
      descrizione: 'B',
      aggiornatoIl: '2026-09-16T10:00:00.000Z',
    });
    expect(esito.success).toBe(false);
  });
});

describe('schemaBarcode', () => {
  it('accetta un barcode di confezione', () => {
    const b = schemaBarcode.parse({
      barcode: 'XY981',
      codiceProdotto: 'FILM500',
      origine: 'easyfatt',
      quantitaConfezione: 12,
      aggiornatoIl: '2026-09-16T10:00:00.000Z',
    });
    expect(b.quantitaConfezione).toBe(12);
  });

  it('rifiuta un origine sconosciuta', () => {
    const esito = schemaBarcode.safeParse({
      barcode: 'XY981',
      codiceProdotto: 'FILM500',
      origine: 'shopify',
      aggiornatoIl: '2026-09-16T10:00:00.000Z',
    });
    expect(esito.success).toBe(false);
  });
});

describe('schemaSessione e schemaRiga', () => {
  it('una sessione nuova nasce aperta e con quantità chieste', () => {
    const s = schemaSessione.parse({
      id: 'sess-1',
      tipo: 'inventario',
      nome: 'Scaffale A',
      creataIl: '2026-09-16T10:00:00.000Z',
    });
    expect(s.stato).toBe('aperta');
    expect(s.modalita).toBe('chiedi_quantita');
    expect(s.righe).toBeUndefined();
  });

  it('una sessione riaperta resta valida con stato aperta e chiusaIl valorizzato', () => {
    const s = schemaSessione.parse({
      id: 'sess-1',
      tipo: 'ddt',
      nome: 'Cliente Rossi',
      stato: 'aperta',
      creataIl: '2026-09-16T10:00:00.000Z',
      chiusaIl: '2026-09-16T11:00:00.000Z',
      righe: [
        {
          id: 'riga-1',
          sessioneId: 'sess-1',
          codiceProdotto: 'FILM500',
          quantita: 2.5,
          barcodeLetto: '8001234567890',
          lettaIl: '2026-09-16T10:30:00.000Z',
          ordine: 0,
        },
      ],
    });
    expect(s.stato).toBe('aperta');
    expect(s.righe?.[0]?.quantita).toBe(2.5);
  });

  it('rifiuta un tipo di sessione sconosciuto', () => {
    expect(
      schemaSessione.safeParse({
        id: 'sess-1',
        tipo: 'trasferimento',
        nome: 'X',
        creataIl: '2026-09-16T10:00:00.000Z',
      }).success,
    ).toBe(false);
  });

  it('rifiuta una riga con ordine negativo o quantità non finita', () => {
    const base = {
      id: 'riga-1',
      sessioneId: 'sess-1',
      codiceProdotto: 'FILM500',
      lettaIl: '2026-09-16T10:30:00.000Z',
    };
    expect(schemaRiga.safeParse({ ...base, quantita: 1, ordine: -1 }).success).toBe(false);
    expect(schemaRiga.safeParse({ ...base, quantita: Number.NaN, ordine: 0 }).success).toBe(false);
  });
});
