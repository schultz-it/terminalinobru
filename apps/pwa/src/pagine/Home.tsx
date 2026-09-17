import { ChevronRight, Plus, RefreshCw, Search, Send, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Avviso } from '../componenti/Avviso.js';
import { Dialogo } from '../componenti/Dialogo.js';
import { ElencoSessioni } from '../componenti/ElencoSessioni.js';
import { Pagina } from '../componenti/Pagina.js';
import { StatoRete } from '../componenti/StatoRete.js';
import { db } from '../db.js';
import { formattaNumero } from '../formato.js';
import { useLiveQuery } from '../hooks/useLiveQuery.js';
import { useOnline } from '../hooks/useOnline.js';
import {
  GIORNI_CONSERVAZIONE_IMPORTATE,
  pulisciSessioniImportate,
  sessioniDaPulire,
} from '../sessioni/operazioni.js';
import { avviaInvioCoda, useStatoCoda } from '../sync/coda.js';
import { avviaSincronizzazione, useStatoSync } from '../sync/statoSync.js';

/** Quante sessioni non aperte mostrare in Home. */
const ULTIME_CHIUSE = 10;

/** Sessioni aperte, ultime chiuse, righe per sessione e stato della coda, tutto dal database. */
function useSessioniHome() {
  return useLiveQuery(async () => {
    const tutte = await db.sessioni.toArray();
    const aperte = tutte
      .filter((sessione) => sessione.stato === 'aperta')
      .sort((a, b) => b.creataIl.localeCompare(a.creataIl));
    const chiuse = tutte
      .filter((sessione) => sessione.stato !== 'aperta')
      .sort((a, b) => (b.chiusaIl ?? b.creataIl).localeCompare(a.chiusaIl ?? a.creataIl))
      .slice(0, ULTIME_CHIUSE);
    const righe = new Map<string, number>();
    for (const sessione of [...aperte, ...chiuse]) {
      righe.set(sessione.id, await db.righe.where('sessioneId').equals(sessione.id).count());
    }
    const coda = await db.codaUpload.toArray();
    const inCoda = new Set(
      coda.filter((voce) => voce.tipo === 'sessione').map((voce) => voce.riferimento),
    );
    const daPulire = (await sessioniDaPulire(db)).length;
    return { aperte, chiuse, righe, inCoda, vociCoda: coda.length, daPulire };
  }, []);
}

export function Home() {
  const prodotti = useLiveQuery(() => db.prodotti.count(), []);
  const clienti = useLiveQuery(() => db.clienti.count(), []);
  const online = useOnline();
  const { inCorso, ultimoEsito } = useStatoSync();
  const sessioni = useSessioniHome();
  const coda = useStatoCoda();
  const [confermaPulizia, setConfermaPulizia] = useState(false);
  const [pulizia, setPulizia] = useState<{ inCorso: boolean; esito?: string }>({
    inCorso: false,
  });

  async function pulisci() {
    setPulizia({ inCorso: true });
    try {
      const cancellate = await pulisciSessioniImportate(db);
      setPulizia({
        inCorso: false,
        esito: `${cancellate} ${cancellate === 1 ? 'sessione cancellata' : 'sessioni cancellate'}.`,
      });
    } catch {
      setPulizia({ inCorso: false, esito: 'Pulizia non riuscita: riprova.' });
    }
    setConfermaPulizia(false);
  }

  return (
    <Pagina titolo="TerminalinoBru">
      {sessioni && sessioni.vociCoda > 0 && (
        <div className="-mx-4 -mt-4 flex items-center gap-2 bg-arancio pr-2">
          <div className="min-w-0 flex-1">
            <Avviso tipo="avviso">
              {sessioni.vociCoda === 1
                ? '1 invio in attesa verso il bridge'
                : `${sessioni.vociCoda} invii in attesa verso il bridge`}
            </Avviso>
          </div>
          <button
            type="button"
            className="pulsante-secondario shrink-0"
            disabled={coda.inCorso || !online}
            onClick={() => void avviaInvioCoda()}
          >
            <Send size={20} />
            {coda.inCorso ? 'Invio…' : 'Invia ora'}
          </button>
        </div>
      )}

      <Link
        to="/sessioni/nuova"
        className="card flex min-h-20 items-center gap-4 p-4 active:bg-grigio-sfondo"
      >
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-giallo text-nero">
          <Plus size={28} strokeWidth={2} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-titolo text-lg font-bold">Nuova sessione</span>
          <span className="etichetta block">Inventario, DDT o carico</span>
        </span>
        <ChevronRight size={24} className="text-grigio-testo" />
      </Link>

      {sessioni && sessioni.aperte.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-base tracking-wide uppercase">Sessioni aperte</h2>
          <ElencoSessioni
            sessioni={sessioni.aperte}
            righe={sessioni.righe}
            inCoda={sessioni.inCoda}
          />
        </section>
      )}

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

      {sessioni && sessioni.chiuse.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-base tracking-wide uppercase">Ultime chiuse</h2>
          <ElencoSessioni
            sessioni={sessioni.chiuse}
            righe={sessioni.righe}
            inCoda={sessioni.inCoda}
          />
        </section>
      )}

      {pulizia.esito && <p className="etichetta">{pulizia.esito}</p>}
      {sessioni && sessioni.daPulire > 0 && (
        <button
          type="button"
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[10px] border border-rosso bg-bianco px-4 font-semibold text-rosso active:bg-grigio-sfondo"
          onClick={() => setConfermaPulizia(true)}
        >
          <Trash2 size={20} />
          Cancella {sessioni.daPulire}{' '}
          {sessioni.daPulire === 1 ? 'sessione importata' : 'sessioni importate'} da oltre{' '}
          {GIORNI_CONSERVAZIONE_IMPORTATE} giorni
        </button>
      )}

      <section className="card flex flex-col gap-4 p-4">
        <h2 className="text-base uppercase tracking-wide">Catalogo</h2>
        <StatoRete />
        <p className="flex flex-wrap gap-x-6 gap-y-1">
          <span>
            <span className="text-2xl font-bold tabular-nums">{formattaNumero(prodotti ?? 0)}</span>{' '}
            <span className="etichetta">{prodotti === 1 ? 'prodotto' : 'prodotti'}</span>
          </span>
          <span>
            <span className="text-2xl font-bold tabular-nums">{formattaNumero(clienti ?? 0)}</span>{' '}
            <span className="etichetta">{clienti === 1 ? 'cliente' : 'clienti'} nel telefono</span>
          </span>
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

      {confermaPulizia && sessioni && (
        <Dialogo
          titolo="Cancellare le sessioni importate?"
          etichettaConferma="Cancella"
          distruttivo
          inCorso={pulizia.inCorso}
          onConferma={() => void pulisci()}
          onAnnulla={() => setConfermaPulizia(false)}
        >
          <p>
            Dal telefono spariscono {sessioni.daPulire}{' '}
            {sessioni.daPulire === 1 ? 'sessione già importata' : 'sessioni già importate'} in
            Easyfatt da oltre {GIORNI_CONSERVAZIONE_IMPORTATE} giorni, con le loro righe. Sul bridge
            restano.
          </p>
        </Dialogo>
      )}
    </Pagina>
  );
}
