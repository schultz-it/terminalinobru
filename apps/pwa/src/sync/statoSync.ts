import { useSyncExternalStore } from 'react';
import { db } from '../db.js';
import { caricaImpostazioni } from '../impostazioni.js';
import { invalidaIndice } from '../ricerca/indice.js';
import { sincronizzaCatalogo, type EsitoSync } from './catalogo.js';

/** Stato condiviso della sincronizzazione, letto da `StatoRete` e dalle schermate. */
export type StatoSync = { inCorso: boolean; ultimoEsito?: EsitoSync };

let stato: StatoSync = { inCorso: false };
let inCorso: Promise<EsitoSync> | undefined;
const ascoltatori = new Set<() => void>();

function aggiorna(nuovo: StatoSync): void {
  stato = nuovo;
  for (const ascolta of ascoltatori) ascolta();
}

/**
 * Avvia la sincronizzazione del catalogo con le impostazioni salvate. Se una è già in corso
 * restituisce quella, così avvio automatico e pulsante non si sovrappongono.
 */
export function avviaSincronizzazione(): Promise<EsitoSync> {
  if (inCorso) return inCorso;
  aggiorna({ ...stato, inCorso: true });
  inCorso = (async () => {
    const impostazioni = await caricaImpostazioni(db);
    const esito = await sincronizzaCatalogo({ db, impostazioni });
    if (esito.ok) invalidaIndice();
    return esito;
  })()
    .catch((): EsitoSync => ({
      ok: false,
      messaggio: 'Errore imprevisto durante la sincronizzazione.',
    }))
    .then((esito) => {
      inCorso = undefined;
      aggiorna({ inCorso: false, ultimoEsito: esito });
      return esito;
    });
  return inCorso;
}

function iscrivi(ascolta: () => void): () => void {
  ascoltatori.add(ascolta);
  return () => ascoltatori.delete(ascolta);
}

/** Stato corrente della sincronizzazione. */
export function useStatoSync(): StatoSync {
  return useSyncExternalStore(iscrivi, () => stato);
}
