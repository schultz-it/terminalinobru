import {
  IMPOSTAZIONI_DEFAULT,
  NUMERO_LISTINI,
  schemaImpostazioni,
  type Impostazioni,
} from '@terminalinobru/core';
import { analizzaStringaFormato } from '@terminalinobru/easyfatt';
import type { DatabaseTerminalino } from './db.js';

/**
 * Chiave del cursore del catalogo: il valore `aggiornatoIl` dell'ultima risposta di
 * `/api/catalogo`, rispedito tale e quale come `dal` (docs/MODELLO-DATI.md sezione 4).
 * Non fa parte di `Impostazioni` perché l'utente non lo vede e non lo modifica.
 */
export const CHIAVE_CURSORE_CATALOGO = 'cursoreCatalogo';

type ChiaveImpostazione = keyof Impostazioni;

const CHIAVI = Object.keys(schemaImpostazioni.shape) as ChiaveImpostazione[];

/**
 * Ricostruisce le impostazioni dalle coppie chiave/valore salvate. Un valore illeggibile non
 * blocca l'app: si usa il default di quel campo e si tengono gli altri.
 */
export function componiImpostazioni(
  voci: readonly { chiave: string; valore: unknown }[],
): Impostazioni {
  const risultato: Record<string, unknown> = { ...IMPOSTAZIONI_DEFAULT };
  for (const { chiave, valore } of voci) {
    if (!(CHIAVI as string[]).includes(chiave)) continue;
    const esito = schemaImpostazioni.shape[chiave as ChiaveImpostazione].safeParse(valore);
    if (esito.success) risultato[chiave] = esito.data;
  }
  return risultato as Impostazioni;
}

/** Legge tutte le impostazioni dal database. */
export async function caricaImpostazioni(db: DatabaseTerminalino): Promise<Impostazioni> {
  return componiImpostazioni(await db.impostazioni.toArray());
}

/** Salva i campi indicati, uno per chiave. */
export async function salvaImpostazioni(
  db: DatabaseTerminalino,
  modifiche: Partial<Impostazioni>,
): Promise<void> {
  const voci = Object.entries(modifiche)
    .filter(([chiave, valore]) => (CHIAVI as string[]).includes(chiave) && valore !== undefined)
    .map(([chiave, valore]) => ({ chiave, valore }));
  await db.impostazioni.bulkPut(voci);
}

/** Errori di validazione del modulo Impostazioni, per campo. */
export type ErroriImpostazioni = Partial<Record<ChiaveImpostazione, string>>;

/** Controlla che l'URL del bridge sia vuoto (stessa origine della PWA) o un indirizzo http(s). */
export function validaUrlBridge(url: string): string | undefined {
  const pulito = url.trim();
  if (pulito === '') return undefined;
  try {
    const analizzato = new URL(pulito);
    if (analizzato.protocol !== 'https:' && analizzato.protocol !== 'http:') {
      return "L'indirizzo del bridge deve iniziare con https://";
    }
    return undefined;
  } catch {
    return 'Indirizzo del bridge non valido: scrivilo completo, per esempio https://bridge.esempio.it';
  }
}

/** Valida le impostazioni modificate dall'utente. Oggetto vuoto se tutto è a posto. */
export function validaImpostazioni(bozza: Impostazioni): ErroriImpostazioni {
  const errori: ErroriImpostazioni = {};
  const erroreUrl = validaUrlBridge(bozza.urlBridge);
  if (erroreUrl) errori.urlBridge = erroreUrl;
  if (/\s/.test(bozza.token.trim())) {
    errori.token = 'Il token non può contenere spazi.';
  }
  const formato = analizzaStringaFormato(bozza.stringaFormato);
  if (!formato.ok) errori.stringaFormato = formato.errore;
  if (
    !Number.isInteger(bozza.listinoMostrato) ||
    bozza.listinoMostrato < 1 ||
    bozza.listinoMostrato > NUMERO_LISTINI
  ) {
    errori.listinoMostrato = `Scegli un listino da 1 a ${NUMERO_LISTINI}.`;
  }
  if (bozza.dispositivo.trim().length > 40) {
    errori.dispositivo = 'Il nome del dispositivo può avere al massimo 40 caratteri.';
  }
  return errori;
}

/** Dati di connessione letti dal QR di setup. */
export type DatiSetup = { urlBridge: string; token: string };

/**
 * Interpreta il testo del QR di setup `terminalinobru://setup?url=...&token=...`.
 * Restituisce i dati oppure il messaggio d'errore da mostrare.
 */
export function analizzaTestoSetup(
  testo: string,
): { ok: true; dati: DatiSetup } | { ok: false; errore: string } {
  const pulito = testo.trim();
  const PREFISSO = 'terminalinobru://setup';
  if (!pulito.toLowerCase().startsWith(PREFISSO)) {
    return { ok: false, errore: 'Il testo non è un codice di setup di TerminalinoBru.' };
  }
  const resto = pulito.slice(PREFISSO.length);
  if (resto !== '' && !resto.startsWith('?')) {
    return { ok: false, errore: 'Il testo non è un codice di setup di TerminalinoBru.' };
  }
  const parametri = new URLSearchParams(resto.slice(1));
  const urlBridge = (parametri.get('url') ?? '').trim();
  const token = (parametri.get('token') ?? '').trim();
  if (urlBridge === '')
    return { ok: false, errore: "Nel codice di setup manca l'indirizzo del bridge." };
  if (token === '') return { ok: false, errore: 'Nel codice di setup manca il token.' };
  const erroreUrl = validaUrlBridge(urlBridge);
  if (erroreUrl) return { ok: false, errore: erroreUrl };
  if (/\s/.test(token)) return { ok: false, errore: 'Il token del codice di setup non è valido.' };
  return { ok: true, dati: { urlBridge: urlBridge.replace(/\/+$/, ''), token } };
}
