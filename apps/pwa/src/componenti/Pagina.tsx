import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';

/** Schermata con barra superiore gialla da 56 px (docs/STILE.md sezione 3). */
export function Pagina({
  titolo,
  indietro,
  azione,
  children,
}: {
  titolo: string;
  /** Mostra il pulsante indietro, che torna alla pagina precedente o a questo percorso. */
  indietro?: string;
  azione?: ReactNode;
  children: ReactNode;
}) {
  const naviga = useNavigate();
  return (
    <>
      <header className="sticky top-0 z-10 bg-giallo pt-[env(safe-area-inset-top)] text-nero">
        <div className="flex h-14 items-center gap-1 px-2">
          {indietro !== undefined ? (
            <button
              type="button"
              aria-label="Indietro"
              className="flex size-12 items-center justify-center rounded-full active:bg-giallo-scuro"
              onClick={() => {
                if (window.history.state?.idx > 0) void naviga(-1);
                else void naviga(indietro);
              }}
            >
              <ArrowLeft size={28} strokeWidth={2} />
            </button>
          ) : (
            <span className="w-2" />
          )}
          <h1 className="min-w-0 flex-1 truncate text-lg tracking-wide uppercase">{titolo}</h1>
          {azione}
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-xl flex-col gap-4 p-4">{children}</main>
    </>
  );
}
