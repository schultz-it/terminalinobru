import type { Prodotto } from '@terminalinobru/core';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { LIMITE_RISULTATI } from '../ricerca/indice.js';
import { useRicerca } from '../ricerca/useRicerca.js';
import { TestoEvidenziato } from './TestoEvidenziato.js';

/** Ricerca a schermo intero per inserire un prodotto senza barcode. */
export function RicercaProdotto({
  queryIniziale = '',
  onScegli,
  onChiudi,
}: {
  queryIniziale?: string;
  onScegli: (prodotto: Prodotto) => void;
  onChiudi: () => void;
}) {
  const [query, setQuery] = useState(queryIniziale);
  const { risultati, pronto, totaleCatalogo } = useRicerca(query);
  const campo = useRef<HTMLInputElement>(null);
  useEffect(() => campo.current?.focus(), []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Cerca prodotto"
      className="fixed inset-0 z-[60] flex flex-col bg-grigio-sfondo text-grafite"
    >
      <header className="bg-giallo pt-[env(safe-area-inset-top)] text-nero">
        <div className="flex h-14 items-center gap-1 px-2">
          <button
            type="button"
            aria-label="Chiudi ricerca"
            className="flex size-12 items-center justify-center rounded-full active:bg-giallo-scuro"
            onClick={onChiudi}
          >
            <ArrowLeft size={28} strokeWidth={2} />
          </button>
          <h2 className="text-lg tracking-wide uppercase">Cerca prodotto</h2>
        </div>
      </header>
      <div className="mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col gap-3 overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <label className="sr-only" htmlFor="ricerca-sessione">
          Cerca per codice o descrizione
        </label>
        <input
          ref={campo}
          id="ricerca-sessione"
          type="search"
          inputMode="search"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="search"
          placeholder="Codice o descrizione"
          className="campo"
          value={query}
          onChange={(evento) => setQuery(evento.target.value)}
          onKeyDown={(evento) => {
            if (evento.key === 'Escape') {
              evento.stopPropagation();
              onChiudi();
            }
          }}
        />
        {pronto && totaleCatalogo === 0 && (
          <p className="etichetta">Il catalogo nel telefono è vuoto: sincronizzalo prima.</p>
        )}
        {query.trim() !== '' && pronto && totaleCatalogo > 0 && (
          <>
            <p className="etichetta" aria-live="polite">
              {risultati.length === 0
                ? 'Nessun prodotto trovato.'
                : risultati.length === LIMITE_RISULTATI
                  ? `Primi ${LIMITE_RISULTATI} risultati: aggiungi parole per restringere.`
                  : `${risultati.length} ${risultati.length === 1 ? 'risultato' : 'risultati'}`}
            </p>
            <ul className="card divide-y divide-grigio-bordo overflow-hidden">
              {risultati.map((prodotto) => (
                <li key={prodotto.codice}>
                  <button
                    type="button"
                    className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left active:bg-grigio-sfondo"
                    onClick={() => onScegli(prodotto)}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-titolo font-bold break-all">
                        <TestoEvidenziato testo={prodotto.codice} query={query} />
                      </span>
                      <span className="block text-base">
                        <TestoEvidenziato testo={prodotto.descrizione} query={query} />
                      </span>
                    </span>
                    <ChevronRight size={24} className="shrink-0 text-grigio-testo" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
