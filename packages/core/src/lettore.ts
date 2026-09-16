/** Evento di tastiera ridotto all'essenziale: il tasto e l'istante in millisecondi. */
export type EventoTasto = {
  tasto: string;
  istante: number;
};

/** Opzioni del riconoscimento delle raffiche del lettore. */
export type OpzioniLettore = {
  /** Massimo intervallo fra due tasti perché siano la stessa raffica. Default 50 ms. */
  sogliaMs?: number;
  /** Lunghezza minima del codice riconosciuto. Default 3 caratteri. */
  lunghezzaMinima?: number;
};

/** Soglia predefinita: sopra i 50 ms per tasto si tratta di digitazione umana. */
export const SOGLIA_RAFFICA_MS = 50;

/** Lunghezza minima predefinita di un codice letto. */
export const LUNGHEZZA_MINIMA_CODICE = 3;

/** Tasti modificatori che il lettore può emettere e che non interrompono la raffica. */
const MODIFICATORI = new Set(['Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'CapsLock']);

/** Riconosce la fine di una raffica: `Enter` o il ritorno a capo grezzo. */
function eInvio(tasto: string): boolean {
  return tasto === 'Enter' || tasto === '\n' || tasto === '\r';
}

/**
 * Restituisce il codice se negli eventi c'è una raffica di tasti sotto soglia terminata da Invio,
 * altrimenti null: la digitazione umana, più lenta, viene ignorata.
 */
export function rilevaInputLettore(
  eventi: readonly EventoTasto[],
  opzioni: OpzioniLettore = {},
): string | null {
  const soglia = opzioni.sogliaMs ?? SOGLIA_RAFFICA_MS;
  const lunghezzaMinima = opzioni.lunghezzaMinima ?? LUNGHEZZA_MINIMA_CODICE;
  let buffer = '';
  let ultimoIstante = 0;
  for (const evento of eventi) {
    const distante = buffer !== '' && evento.istante - ultimoIstante >= soglia;
    if (eInvio(evento.tasto)) {
      if (!distante && buffer.length >= lunghezzaMinima) return buffer;
      buffer = '';
      continue;
    }
    if (MODIFICATORI.has(evento.tasto)) continue;
    if (evento.tasto.length !== 1) {
      buffer = '';
      continue;
    }
    buffer = distante ? evento.tasto : buffer + evento.tasto;
    ultimoIstante = evento.istante;
  }
  return null;
}
