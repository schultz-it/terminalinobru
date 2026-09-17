import type { Impostazioni } from '@terminalinobru/core';
import { useCallback, useMemo } from 'react';
import { db } from '../db.js';
import { componiImpostazioni, salvaImpostazioni } from '../impostazioni.js';
import { useLiveQuery } from './useLiveQuery.js';

/** Impostazioni correnti, aggiornate in tempo reale, e funzione per salvarle. */
export function useImpostazioni(): {
  impostazioni: Impostazioni | undefined;
  salva: (modifiche: Partial<Impostazioni>) => Promise<void>;
} {
  const voci = useLiveQuery(() => db.impostazioni.toArray(), []);
  const salva = useCallback(
    (modifiche: Partial<Impostazioni>) => salvaImpostazioni(db, modifiche),
    [],
  );
  const impostazioni = useMemo(
    () => (voci === undefined ? undefined : componiImpostazioni(voci)),
    [voci],
  );
  return { impostazioni, salva };
}
