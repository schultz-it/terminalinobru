import type { StatoSessione } from '@terminalinobru/core';
import type { SessioneBridge } from '../sync/sessioni.js';

/** Filtro proposto all'apertura della pagina: le sessioni ancora da lavorare sul PC. */
export const FILTRO_STATO_DEFAULT: ReadonlySet<StatoSessione> = new Set(['chiusa', 'esportata']);

/** Tutti gli stati che una sessione può avere sul bridge, nell'ordine mostrato nei filtri. */
export const STATI_FILTRO: readonly StatoSessione[] = ['chiusa', 'esportata', 'importata'];

/** Sessioni del bridge che passano il filtro per stato, nell'ordine ricevuto (già per data decrescente). */
export function filtraSessioni(
  sessioni: readonly SessioneBridge[],
  filtro: ReadonlySet<StatoSessione>,
): SessioneBridge[] {
  return sessioni.filter((sessione) => filtro.has(sessione.stato));
}
