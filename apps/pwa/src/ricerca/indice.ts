import { costruisciIndice, type IndiceRicerca } from '@terminalinobru/core';
import type { DatabaseTerminalino } from '../db.js';

/** Numero massimo di risultati mostrati mentre si digita. */
export const LIMITE_RISULTATI = 30;

let cache: { db: DatabaseTerminalino; indice: Promise<IndiceRicerca> } | undefined;
const ascoltatori = new Set<() => void>();

/**
 * Indice di ricerca costruito dai prodotti in Dexie e tenuto in memoria. Si ricostruisce solo
 * dopo `invalidaIndice`, cioè dopo una sincronizzazione andata a buon fine.
 */
export function ottieniIndice(db: DatabaseTerminalino): Promise<IndiceRicerca> {
  if (cache?.db !== db) {
    const indice = db.prodotti.toArray().then(costruisciIndice);
    cache = { db, indice };
    // Se la lettura fallisce, la prossima richiesta riprova invece di restare bloccata sull'errore.
    indice.catch(() => {
      if (cache?.indice === indice) cache = undefined;
    });
  }
  return cache.indice;
}

/** Scarta l'indice in memoria e avvisa chi lo usa, che lo richiederà aggiornato. */
export function invalidaIndice(): void {
  cache = undefined;
  for (const ascolta of ascoltatori) ascolta();
}

/** Registra una funzione chiamata a ogni invalidazione dell'indice. */
export function allInvalidazione(ascolta: () => void): () => void {
  ascoltatori.add(ascolta);
  return () => {
    ascoltatori.delete(ascolta);
  };
}
