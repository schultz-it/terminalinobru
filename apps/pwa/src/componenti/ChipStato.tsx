import type { StatoSessione } from '@terminalinobru/core';
import { ETICHETTE_STATO } from '../sessioni/modello.js';

const CLASSI: Record<StatoSessione, string> = {
  aperta: 'bg-giallo-chiaro border-giallo-scuro',
  chiusa: 'bg-grigio-sfondo border-grigio-bordo',
  esportata: 'bg-arancio/15 border-arancio',
  importata: 'bg-verde/15 border-verde',
};

/** Chip dello stato di una sessione (docs/STILE.md sezione 4). */
export function ChipStato({ stato }: { stato: StatoSessione }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-sm font-semibold text-grafite ${CLASSI[stato]}`}
    >
      {ETICHETTE_STATO[stato]}
    </span>
  );
}
