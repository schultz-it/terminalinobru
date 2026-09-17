import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';

/**
 * Esegue una query Dexie e la riesegue quando i dati coinvolti cambiano.
 * `undefined` finché il primo risultato non è pronto.
 */
export function useLiveQuery<T>(
  query: () => Promise<T> | T,
  dipendenze: readonly unknown[],
): T | undefined {
  const [valore, setValore] = useState<T | undefined>(undefined);
  useEffect(() => {
    const sottoscrizione = liveQuery(query).subscribe({
      next: (risultato) => setValore(() => risultato),
      error: (errore: unknown) => console.error('Lettura dal database non riuscita', errore),
    });
    return () => sottoscrizione.unsubscribe();
  }, dipendenze);
  return valore;
}
