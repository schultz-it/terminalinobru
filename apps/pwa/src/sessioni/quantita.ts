/** Decimali ammessi in una quantità: il file del terminalino ne scrive al massimo 3. */
export const DECIMALI_QUANTITA = 3;

/** Esito della lettura di una quantità digitata. */
export type LetturaQuantita =
  | { tipo: 'ok'; valore: number }
  /** Quantità zero: valida solo dopo un avviso confermato (per esempio un inventario a zero). */
  | { tipo: 'zero' }
  | { tipo: 'errore'; messaggio: string };

/**
 * Interpreta la quantità scritta sul tastierino. Accetta virgola o punto come separatore
 * decimale, fino a 3 decimali. Rifiuta testo vuoto, negativi e caratteri non numerici; lo zero
 * torna come caso a parte perché chi chiama deve chiedere conferma.
 */
export function leggiQuantita(testo: string): LetturaQuantita {
  const pulito = testo.trim().replace(',', '.');
  if (pulito === '') return { tipo: 'errore', messaggio: 'Scrivi la quantità.' };
  if (pulito.startsWith('-')) {
    return { tipo: 'errore', messaggio: 'La quantità non può essere negativa.' };
  }
  const forma = /^(\d+)(?:\.(\d*))?$|^\.(\d+)$/.exec(pulito);
  if (!forma)
    return { tipo: 'errore', messaggio: 'Quantità non valida: usa solo cifre e virgola.' };
  const decimali = forma[2] ?? forma[3] ?? '';
  if (decimali.length > DECIMALI_QUANTITA) {
    return { tipo: 'errore', messaggio: `Al massimo ${DECIMALI_QUANTITA} decimali.` };
  }
  const valore = Number(pulito.endsWith('.') ? pulito.slice(0, -1) : pulito);
  if (!Number.isFinite(valore) || valore > 1e9) {
    return { tipo: 'errore', messaggio: 'Quantità troppo grande.' };
  }
  if (valore === 0) return { tipo: 'zero' };
  return { tipo: 'ok', valore };
}

/** Dice se una quantità può essere salvata in una riga: numero finito, non negativo. */
export function quantitaSalvabile(quantita: number): boolean {
  return Number.isFinite(quantita) && quantita >= 0;
}
