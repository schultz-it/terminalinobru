import { prezziVuoti, type Prodotto, type Riga } from '../src/index.js';

/** Costruisce un prodotto di prova, sovrascrivibile campo per campo. */
export function prodotto(
  codice: string,
  descrizione: string,
  extra: Partial<Prodotto> = {},
): Prodotto {
  return {
    codice,
    descrizione,
    prezziNetti: prezziVuoti(),
    prezziLordi: prezziVuoti(),
    gestioneMagazzino: true,
    aggiornatoIl: '2026-09-16T10:00:00.000Z',
    ...extra,
  };
}

/** Costruisce una riga di sessione di prova. */
export function riga(codiceProdotto: string, quantita: number, ordine: number): Riga {
  return {
    id: `riga-${ordine}`,
    sessioneId: 'sessione-1',
    codiceProdotto,
    quantita,
    lettaIl: '2026-09-16T10:00:00.000Z',
    ordine,
  };
}
