import { useSyncExternalStore } from 'react';

function iscrivi(avvisa: () => void): () => void {
  window.addEventListener('online', avvisa);
  window.addEventListener('offline', avvisa);
  return () => {
    window.removeEventListener('online', avvisa);
    window.removeEventListener('offline', avvisa);
  };
}

/** `true` se il browser dice di essere in rete. */
export function useOnline(): boolean {
  return useSyncExternalStore(iscrivi, () => navigator.onLine);
}
