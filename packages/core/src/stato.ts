import type { StatoSessione } from './tipi.js';

/** Transizioni di stato ammesse per una sessione, riapertura inclusa. */
export const TRANSIZIONI_AMMESSE: Readonly<Record<StatoSessione, readonly StatoSessione[]>> = {
  aperta: ['chiusa'],
  chiusa: ['esportata', 'aperta'],
  esportata: ['importata'],
  importata: [],
};

/** Dice se il passaggio di stato `da → a` è ammesso. */
export function transizioneStato(da: StatoSessione, a: StatoSessione): boolean {
  return TRANSIZIONI_AMMESSE[da].includes(a);
}
