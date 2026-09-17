import { useEffect, useId, useRef, type ReactNode } from 'react';

/**
 * Richiesta di conferma a tutto schermo, per le azioni distruttive o irreversibili
 * (docs/STILE.md sezione 4: pulsante distruttivo sempre con conferma).
 */
export function Dialogo({
  titolo,
  children,
  etichettaConferma,
  distruttivo = false,
  inCorso = false,
  onConferma,
  onAnnulla,
}: {
  titolo: string;
  children?: ReactNode;
  etichettaConferma: string;
  distruttivo?: boolean;
  inCorso?: boolean;
  onConferma: () => void;
  onAnnulla: () => void;
}) {
  const idTitolo = useId();
  const annulla = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // Il fuoco va su "Annulla": un Invio distratto non deve cancellare nulla.
    annulla.current?.focus();
  }, []);
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-nero/60 sm:items-center">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={idTitolo}
        className="flex w-full max-w-xl flex-col gap-4 rounded-t-xl bg-bianco p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-grafite sm:rounded-xl"
        onKeyDown={(evento) => {
          if (evento.key === 'Escape') {
            evento.stopPropagation();
            onAnnulla();
          }
        }}
      >
        <h2 id={idTitolo} className="text-lg">
          {titolo}
        </h2>
        {children}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={inCorso}
            className={
              distruttivo
                ? 'inline-flex min-h-12 items-center justify-center gap-2 rounded-[10px] border border-rosso bg-bianco px-4 font-bold text-rosso active:bg-grigio-sfondo disabled:opacity-50'
                : 'pulsante-primario'
            }
            onClick={onConferma}
          >
            {etichettaConferma}
          </button>
          <button
            ref={annulla}
            type="button"
            disabled={inCorso}
            className="pulsante-secondario"
            onClick={onAnnulla}
          >
            Annulla
          </button>
        </div>
      </div>
    </div>
  );
}
