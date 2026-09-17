import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import type { SessioneLocale } from '../db.js';
import { formattaDataOra, formattaNumero } from '../formato.js';
import { ETICHETTE_TIPO } from '../sessioni/modello.js';
import { ChipStato } from './ChipStato.js';
import { IconaTipo } from './IconaTipo.js';

/** Elenco di sessioni con tipo, nome, righe e stato; tocco per aprirle. */
export function ElencoSessioni({
  sessioni,
  righe,
  inCoda,
}: {
  sessioni: readonly SessioneLocale[];
  /** Numero di righe per id di sessione. */
  righe: ReadonlyMap<string, number>;
  /** Id delle sessioni in attesa di invio al bridge. */
  inCoda: ReadonlySet<string>;
}) {
  return (
    <ul className="card divide-y divide-grigio-bordo overflow-hidden">
      {sessioni.map((sessione) => {
        const conteggio = righe.get(sessione.id) ?? 0;
        return (
          <li key={sessione.id}>
            <Link
              to={`/sessioni/${sessione.id}`}
              className="flex min-h-16 items-center gap-3 px-4 py-3 active:bg-grigio-sfondo"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-giallo-chiaro text-nero">
                <IconaTipo tipo={sessione.tipo} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold break-words">{sessione.nome}</span>
                <span className="etichetta block">
                  {ETICHETTE_TIPO[sessione.tipo]} · {formattaNumero(conteggio)}{' '}
                  {conteggio === 1 ? 'riga' : 'righe'} ·{' '}
                  {formattaDataOra(sessione.chiusaIl ?? sessione.creataIl)}
                </span>
                {inCoda.has(sessione.id) && (
                  <span className="block text-sm font-semibold text-arancio">
                    In attesa di invio
                  </span>
                )}
              </span>
              <ChipStato stato={sessione.stato} />
              <ChevronRight size={24} className="shrink-0 text-grigio-testo" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
