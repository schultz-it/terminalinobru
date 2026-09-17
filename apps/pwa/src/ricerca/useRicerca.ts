import { cercaProdotti, type IndiceRicerca, type Prodotto } from '@terminalinobru/core';
import { useEffect, useMemo, useState } from 'react';
import { db } from '../db.js';
import { allInvalidazione, LIMITE_RISULTATI, ottieniIndice } from './indice.js';

/** Indice di ricerca condiviso, ricaricato dopo ogni sincronizzazione. */
export function useIndiceRicerca(): IndiceRicerca | undefined {
  const [indice, setIndice] = useState<IndiceRicerca>();
  const [versione, setVersione] = useState(0);

  useEffect(() => allInvalidazione(() => setVersione((v) => v + 1)), []);

  useEffect(() => {
    let annullato = false;
    ottieniIndice(db).then(
      (nuovo) => {
        if (!annullato) setIndice(nuovo);
      },
      (errore: unknown) => console.error('Indice di ricerca non disponibile', errore),
    );
    return () => {
      annullato = true;
    };
  }, [versione]);

  return indice;
}

/** Risultati della ricerca per codice e descrizione, al massimo {@link LIMITE_RISULTATI}. */
export function useRicerca(query: string): {
  risultati: Prodotto[];
  pronto: boolean;
  totaleCatalogo: number;
} {
  const indice = useIndiceRicerca();
  const risultati = useMemo(
    () => (indice ? cercaProdotti(indice, query, LIMITE_RISULTATI) : []),
    [indice, query],
  );
  return { risultati, pronto: indice !== undefined, totaleCatalogo: indice?.voci.length ?? 0 };
}
