import type { Impostazioni } from '@terminalinobru/core';
import type { EsitoLettura } from './tipi.js';

type Tono = { frequenza: number; durata: number; pausa?: number };

/** Suoni e vibrazioni per esito. Frequenze in Hz, durate in secondi, vibrazione in ms. */
export const SEGNALI: Record<
  Exclude<EsitoLettura, 'ignorato'>,
  { toni: Tono[]; vibrazione: number[] }
> = {
  // Un bip acuto e breve, come un terminalino.
  trovato: { toni: [{ frequenza: 1760, durata: 0.08 }], vibrazione: [50] },
  // Due note basse discendenti e vibrazione doppia.
  sconosciuto: {
    toni: [
      { frequenza: 440, durata: 0.12, pausa: 0.06 },
      { frequenza: 294, durata: 0.2 },
    ],
    vibrazione: [80, 80, 80],
  },
};

type CostruttoreAudio = typeof AudioContext;

let contesto: AudioContext | undefined;

function ottieniContesto(): AudioContext | undefined {
  if (!contesto) {
    const Costruttore =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: CostruttoreAudio }).webkitAudioContext;
    if (!Costruttore) return undefined;
    contesto = new Costruttore();
  }
  if (contesto.state === 'suspended') void contesto.resume().catch(() => undefined);
  return contesto;
}

/**
 * Prepara l'audio. Va chiamata in risposta a un tocco (apertura dello scanner): Chrome sblocca
 * Web Audio solo dopo un gesto dell'utente.
 */
export function preparaAudio(): void {
  try {
    ottieniContesto();
  } catch {
    // Audio non disponibile: resta la vibrazione.
  }
}

function suona(toni: Tono[]): void {
  const audio = ottieniContesto();
  if (!audio) return;
  let inizio = audio.currentTime + 0.01;
  for (const { frequenza, durata, pausa = 0 } of toni) {
    const oscillatore = audio.createOscillator();
    const volume = audio.createGain();
    oscillatore.type = 'square';
    oscillatore.frequency.value = frequenza;
    // Attacco e rilascio rapidi per evitare il clic.
    volume.gain.setValueAtTime(0, inizio);
    volume.gain.linearRampToValueAtTime(0.15, inizio + 0.005);
    volume.gain.setValueAtTime(0.15, inizio + durata - 0.01);
    volume.gain.linearRampToValueAtTime(0, inizio + durata);
    oscillatore.connect(volume).connect(audio.destination);
    oscillatore.start(inizio);
    oscillatore.stop(inizio + durata);
    inizio += durata + pausa;
  }
}

/** Suono e vibrazione per l'esito di una lettura, secondo le impostazioni. Non lancia mai. */
export function segnalaEsito(
  esito: EsitoLettura,
  impostazioni: Pick<Impostazioni, 'suoni' | 'vibrazione'>,
): void {
  if (esito === 'ignorato') return;
  const segnale = SEGNALI[esito];
  if (impostazioni.suoni) {
    try {
      suona(segnale.toni);
    } catch {
      // Un problema audio non deve mai bloccare la lettura.
    }
  }
  if (impostazioni.vibrazione && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(segnale.vibrazione);
    } catch {
      // Vibrazione non consentita: si ignora.
    }
  }
}
