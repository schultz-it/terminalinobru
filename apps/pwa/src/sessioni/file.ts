import { aggregaRighe, type Impostazioni, type Riga } from '@terminalinobru/core';
import { generaFileTerminale } from '@terminalinobru/easyfatt';
import type { SessioneLocale } from '../db.js';
import { nomeFileTerminale } from './modello.js';

/** Testo del file del terminalino generato sul telefono, con le impostazioni locali. */
export function testoFileTerminale(
  righe: readonly Riga[],
  impostazioni: Pick<Impostazioni, 'stringaFormato' | 'separatoreDecimale'>,
): string {
  return generaFileTerminale(aggregaRighe(righe), {
    stringaFormato: impostazioni.stringaFormato,
    separatoreDecimale: impostazioni.separatoreDecimale,
  });
}

/** Com'è andata la condivisione: con il foglio di Android, come download, o annullata. */
export type EsitoCondivisione = 'condiviso' | 'scaricato' | 'annullato';

/**
 * Genera il file del terminalino e lo passa al foglio di condivisione di Android
 * (`navigator.share` con un `File`); dove non è possibile lo scarica. Lancia
 * `ErroreFileTerminale` se la stringa formato delle impostazioni non è valida.
 */
export async function condividiFileTerminale(
  sessione: Pick<SessioneLocale, 'tipo' | 'nome'>,
  righe: readonly Riga[],
  impostazioni: Pick<Impostazioni, 'stringaFormato' | 'separatoreDecimale'>,
  adesso: Date = new Date(),
): Promise<EsitoCondivisione> {
  const testo = testoFileTerminale(righe, impostazioni);
  const nome = nomeFileTerminale(sessione.tipo, sessione.nome, adesso);
  const file = new File([testo], nome, { type: 'text/plain' });
  const dati: ShareData = { files: [file], title: sessione.nome };
  if (typeof navigator.share === 'function' && navigator.canShare?.(dati)) {
    try {
      await navigator.share(dati);
      return 'condiviso';
    } catch (errore) {
      if (errore instanceof DOMException && errore.name === 'AbortError') return 'annullato';
      // Condivisione rifiutata dal sistema: si ripiega sul download.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const collegamento = document.createElement('a');
    collegamento.href = url;
    collegamento.download = nome;
    document.body.appendChild(collegamento);
    collegamento.click();
    collegamento.remove();
  } finally {
    // Il click avvia il download in modo sincrono per il browser, ma si lascia un attimo di margine.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
  return 'scaricato';
}
