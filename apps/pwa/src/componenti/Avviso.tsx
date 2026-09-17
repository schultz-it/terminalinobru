import type { ReactNode } from 'react';

const SFONDI = { avviso: 'bg-arancio', errore: 'bg-rosso', conferma: 'bg-verde' } as const;

/** Barra piena a tutta larghezza con testo bianco (docs/STILE.md sezione 4). */
export function Avviso({ tipo, children }: { tipo: keyof typeof SFONDI; children: ReactNode }) {
  return (
    <div
      role={tipo === 'errore' ? 'alert' : 'status'}
      className={`${SFONDI[tipo]} px-4 py-3 text-base font-semibold text-bianco`}
    >
      {children}
    </div>
  );
}
