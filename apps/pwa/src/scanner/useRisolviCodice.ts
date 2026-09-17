import type { Prodotto } from '@terminalinobru/core';
import { db } from '../db.js';
import { useLiveQuery } from '../hooks/useLiveQuery.js';
import { risolviCodice } from './risolvi.js';

/**
 * Prodotto corrispondente al codice letto, o `null` se sconosciuto. `undefined` finché la
 * lettura dal database non è pronta. Si aggiorna da solo dopo una sync o un abbinamento.
 */
export function useRisolviCodice(codice: string | null | undefined): Prodotto | null | undefined {
  return useLiveQuery(() => (codice ? risolviCodice(db, codice) : null), [codice]);
}
