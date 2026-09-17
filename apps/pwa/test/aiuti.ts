import { prezziVuoti, type Barcode, type Prodotto } from '@terminalinobru/core';
import { DatabaseTerminalino } from '../src/db.js';

let contatore = 0;

/** Database nuovo e vuoto per ogni test. */
export function nuovoDb(): DatabaseTerminalino {
  contatore += 1;
  return new DatabaseTerminalino(`test-${contatore}-${Math.random().toString(36).slice(2)}`);
}

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

export function barcode(
  codice: string,
  codiceProdotto: string,
  extra: Partial<Barcode> = {},
): Barcode {
  return {
    barcode: codice,
    codiceProdotto,
    origine: 'easyfatt',
    aggiornatoIl: '2026-09-16T10:00:00.000Z',
    ...extra,
  };
}

/** Fetch finto che risponde in sequenza e registra le chiamate. */
export function fetchFinto(...risposte: (Response | Error)[]) {
  const chiamate: { url: string; init: RequestInit | undefined }[] = [];
  const recupera = (async (url: string | URL | Request, init?: RequestInit) => {
    chiamate.push({ url: String(url), init });
    const risposta = risposte.shift();
    if (risposta === undefined) throw new Error('Nessuna risposta finta rimasta');
    if (risposta instanceof Error) throw risposta;
    return risposta;
  }) as typeof fetch;
  return { recupera, chiamate };
}
