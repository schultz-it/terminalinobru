import { ChevronRight, ClipboardList, RefreshCw, Search } from 'lucide-react';
import { Link } from 'react-router';
import { Avviso } from '../componenti/Avviso.js';
import { Pagina } from '../componenti/Pagina.js';
import { StatoRete } from '../componenti/StatoRete.js';
import { db } from '../db.js';
import { formattaNumero } from '../formato.js';
import { useLiveQuery } from '../hooks/useLiveQuery.js';
import { useOnline } from '../hooks/useOnline.js';
import { avviaSincronizzazione, useStatoSync } from '../sync/statoSync.js';

export function Home() {
  const prodotti = useLiveQuery(() => db.prodotti.count(), []);
  const online = useOnline();
  const { inCorso, ultimoEsito } = useStatoSync();

  return (
    <Pagina titolo="TerminalinoBru">
      {/* Punto di aggancio per T07: elenco sessioni aperte e creazione di una nuova sessione. */}
      <button
        type="button"
        disabled
        className="card flex min-h-20 items-center gap-4 p-4 text-left opacity-60"
        aria-describedby="nuova-sessione-nota"
      >
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-giallo-chiaro text-nero">
          <ClipboardList size={28} strokeWidth={2} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-titolo text-lg font-bold">Nuova sessione</span>
          <span id="nuova-sessione-nota" className="etichetta block">
            Inventario, DDT e carico: disponibile a breve
          </span>
        </span>
      </button>

      <Link
        to="/consulta"
        className="card flex min-h-20 items-center gap-4 p-4 active:bg-grigio-sfondo"
      >
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-giallo text-nero">
          <Search size={28} strokeWidth={2} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-titolo text-lg font-bold">Consulta prodotto</span>
          <span className="etichetta block">Prezzi, giacenza e ubicazione</span>
        </span>
        <ChevronRight size={24} className="text-grigio-testo" />
      </Link>

      <section className="card flex flex-col gap-4 p-4">
        <h2 className="text-base uppercase tracking-wide">Catalogo</h2>
        <StatoRete />
        <p>
          <span className="text-2xl font-bold tabular-nums">{formattaNumero(prodotti ?? 0)}</span>{' '}
          <span className="etichetta">prodotti nel telefono</span>
        </p>
        <button
          type="button"
          className="pulsante-secondario"
          disabled={inCorso || !online}
          onClick={() => void avviaSincronizzazione()}
        >
          <RefreshCw size={20} className={inCorso ? 'animate-spin' : ''} />
          {inCorso ? 'Sincronizzazione…' : 'Sincronizza ora'}
        </button>
      </section>
      {ultimoEsito && !ultimoEsito.ok && (
        <div className="-mx-4">
          <Avviso tipo="errore">{ultimoEsito.messaggio}</Avviso>
        </div>
      )}
    </Pagina>
  );
}
