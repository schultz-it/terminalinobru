import { describe, expect, it } from 'vitest';
import { istanteInvio, rigaABarcode, rigaAProdotto } from '../src/catalogo-db.js';
import type { RigaBarcode, RigaProdotto } from '../src/catalogo-db.js';

/** Riga di prodotto minima, con i soli campi obbligatori valorizzati. */
function rigaMinima(): RigaProdotto {
  return {
    codice: 'X1',
    descrizione: 'Prodotto',
    categoria: null,
    sottocategoria: null,
    um: null,
    prezzi_netti: '[1,null,null,null,null,null,null,null,null]',
    prezzi_lordi: 'non un json',
    iva_perc: null,
    gestione_magazzino: 0,
    ubicazione: null,
    scorta_minima: null,
    giacenza: null,
    ordinato: null,
    fornitore: null,
    codice_fornitore: null,
    note: null,
    aggiornato_il: '2026-02-01T00:00:00.000Z',
    eliminato_il: null,
  };
}

describe('istanteInvio', () => {
  it("usa l'istante corrente quando non c'è un invio precedente", () => {
    expect(istanteInvio('2026-02-01T10:00:00.000Z', null)).toBe('2026-02-01T10:00:00.000Z');
  });

  it("usa l'istante corrente se è posteriore all'ultimo invio", () => {
    expect(istanteInvio('2026-02-01T10:00:00.000Z', '2026-02-01T09:00:00.000Z')).toBe(
      '2026-02-01T10:00:00.000Z',
    );
  });

  it('sposta avanti di un millisecondo se due invii cadono nello stesso istante', () => {
    expect(istanteInvio('2026-02-01T10:00:00.000Z', '2026-02-01T10:00:00.000Z')).toBe(
      '2026-02-01T10:00:00.001Z',
    );
  });

  it('ignora un ultimo invio con data illeggibile', () => {
    expect(istanteInvio('2026-02-01T10:00:00.000Z', 'non una data')).toBe(
      '2026-02-01T10:00:00.000Z',
    );
  });
});

describe('conversione delle righe', () => {
  it('omette i campi assenti e tollera listini rovinati', () => {
    const prodotto = rigaAProdotto(rigaMinima());
    expect(prodotto.prezziNetti).toEqual([1, null, null, null, null, null, null, null, null]);
    expect(prodotto.prezziLordi).toEqual(new Array(9).fill(null));
    expect(prodotto.gestioneMagazzino).toBe(false);
    expect(prodotto).not.toHaveProperty('categoria');
    expect(prodotto).not.toHaveProperty('eliminatoIl');
  });

  it('riporta i listini non numerici a null', () => {
    const riga = { ...rigaMinima(), prezzi_netti: '["due",3]' };
    expect(rigaAProdotto(riga).prezziNetti).toEqual([null, 3]);
  });

  it('riporta il tombstone quando presente', () => {
    const riga = { ...rigaMinima(), eliminato_il: '2026-03-01T00:00:00.000Z' };
    expect(rigaAProdotto(riga).eliminatoIl).toBe('2026-03-01T00:00:00.000Z');
  });

  it('converte una riga di barcode', () => {
    const riga: RigaBarcode = {
      barcode: '123',
      codice_prodotto: 'X1',
      origine: 'app',
      quantita_confezione: 6,
      aggiornato_il: '2026-02-01T00:00:00.000Z',
    };
    expect(rigaABarcode(riga)).toEqual({
      barcode: '123',
      codiceProdotto: 'X1',
      origine: 'app',
      quantitaConfezione: 6,
      aggiornatoIl: '2026-02-01T00:00:00.000Z',
    });
  });
});
