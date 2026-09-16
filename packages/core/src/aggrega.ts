import type { Riga } from './tipi.js';

/** Dati minimi di una riga necessari all'aggregazione. */
export type RigaAggregabile = Pick<Riga, 'codiceProdotto' | 'quantita' | 'ordine'>;

/** Quantità totale letta per un codice prodotto. */
export type QuantitaPerCodice = { codice: string; quantita: number };

/** Decimali massimi ammessi dal file terminalino (docs/PROTOCOLLI-DANEA.md sezione 1.2). */
const DECIMALI_MASSIMI = 3;

/** Arrotonda a 3 decimali per evitare gli errori di somma dei float. */
export function arrotondaQuantita(quantita: number): number {
  const fattore = 10 ** DECIMALI_MASSIMI;
  return Math.round(quantita * fattore) / fattore;
}

/**
 * Somma le quantità per codice prodotto, nell'ordine di prima comparsa secondo il campo `ordine`.
 */
export function aggregaRighe(righe: readonly RigaAggregabile[]): QuantitaPerCodice[] {
  const ordinate = [...righe].sort((a, b) => a.ordine - b.ordine);
  const totali = new Map<string, number>();
  for (const riga of ordinate) {
    const precedente = totali.get(riga.codiceProdotto) ?? 0;
    totali.set(riga.codiceProdotto, precedente + riga.quantita);
  }
  return [...totali].map(([codice, quantita]) => ({
    codice,
    quantita: arrotondaQuantita(quantita),
  }));
}
