/** Problema all'avvio della fotocamera, con testo per l'utente. */
export type ProblemaFotocamera = {
  /** `negato`: l'utente o il browser hanno rifiutato il permesso. */
  tipo: 'negato' | 'assente' | 'occupata' | 'non-supportata' | 'altro';
  messaggio: string;
};

/** Traduce l'errore di `getUserMedia` in un messaggio leggibile. */
export function descriviErroreFotocamera(errore: unknown): ProblemaFotocamera {
  const nome = errore instanceof Error || errore instanceof DOMException ? errore.name : '';
  switch (nome) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return {
        tipo: 'negato',
        messaggio:
          'Permesso per la fotocamera negato. Premi Riprova e consenti; se non compare la richiesta, abilita la fotocamera dalle impostazioni del sito (icona a sinistra dell’indirizzo).',
      };
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return { tipo: 'assente', messaggio: 'Nessuna fotocamera trovata su questo dispositivo.' };
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return {
        tipo: 'occupata',
        messaggio: 'La fotocamera è usata da un’altra app. Chiudila e premi Riprova.',
      };
    case 'TypeError':
      return {
        tipo: 'non-supportata',
        messaggio: 'Fotocamera non disponibile: l’app deve essere aperta da un indirizzo https.',
      };
    default:
      return { tipo: 'altro', messaggio: 'Non riesco ad avviare la fotocamera. Premi Riprova.' };
  }
}

/** Vincoli video: fotocamera scelta se indicata, altrimenti quella posteriore. */
export function vincoliVideo(idDispositivo: string | undefined): MediaStreamConstraints {
  const risoluzione = { width: { ideal: 1280 }, height: { ideal: 720 } };
  return {
    audio: false,
    video: idDispositivo
      ? { deviceId: { exact: idDispositivo }, ...risoluzione }
      : { facingMode: { ideal: 'environment' }, ...risoluzione },
  };
}

/** Fotocamera successiva nell'elenco, per il pulsante "cambia fotocamera". */
export function fotocameraSuccessiva(
  elenco: readonly string[],
  attuale: string | undefined,
): string | undefined {
  if (elenco.length === 0) return undefined;
  const posizione = attuale === undefined ? -1 : elenco.indexOf(attuale);
  return elenco[(posizione + 1) % elenco.length];
}

const CHIAVE_FOTOCAMERA = 'terminalinobru.fotocamera';

/** Fotocamera scelta l'ultima volta, se il browser lascia leggere lo storage. */
export function leggiFotocameraScelta(): string | undefined {
  try {
    return localStorage.getItem(CHIAVE_FOTOCAMERA) ?? undefined;
  } catch {
    return undefined;
  }
}

export function salvaFotocameraScelta(id: string | undefined): void {
  try {
    if (id) localStorage.setItem(CHIAVE_FOTOCAMERA, id);
    else localStorage.removeItem(CHIAVE_FOTOCAMERA);
  } catch {
    // Storage non disponibile: la scelta vale solo per questa apertura.
  }
}

/** Ferma tutte le tracce di uno stream: spegne la fotocamera e la sua spia. */
export function fermaStream(stream: MediaStream | undefined): void {
  for (const traccia of stream?.getTracks() ?? []) traccia.stop();
}
