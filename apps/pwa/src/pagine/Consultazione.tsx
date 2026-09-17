import { ChevronRight, ScanBarcode } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { Pagina } from '../componenti/Pagina.js';
import { TestoEvidenziato } from '../componenti/TestoEvidenziato.js';
import { LIMITE_RISULTATI } from '../ricerca/indice.js';
import { useRicerca } from '../ricerca/useRicerca.js';
import { useScansioneConsultazione } from '../scanner/useScansioneConsultazione.js';

export function Consultazione() {
  // La query sta nell'indirizzo: tornando indietro dalla scheda la ricerca è ancora lì.
  const [parametri, setParametri] = useSearchParams();
  const query = parametri.get('q') ?? '';
  const { risultati, pronto, totaleCatalogo } = useRicerca(query);
  const scansione = useScansioneConsultazione();

  return (
    <Pagina titolo="Consulta">
      {scansione.scanner}
      <div className="flex gap-2">
        <label className="sr-only" htmlFor="ricerca">
          Cerca per codice o descrizione
        </label>
        <input
          id="ricerca"
          type="search"
          inputMode="search"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          autoFocus
          enterKeyHint="search"
          placeholder="Codice o descrizione"
          className="campo"
          value={query}
          onChange={(evento) =>
            setParametri(evento.target.value === '' ? {} : { q: evento.target.value }, {
              replace: true,
            })
          }
        />
        <button
          type="button"
          aria-label="Scansiona"
          title="Scansiona"
          className="pulsante-primario w-12 shrink-0 px-0"
          onClick={scansione.apri}
        >
          <ScanBarcode size={24} strokeWidth={2} />
        </button>
      </div>

      {pronto && totaleCatalogo === 0 && (
        <div className="card p-4">
          <p className="font-semibold">Il catalogo nel telefono è vuoto.</p>
          <p className="etichetta mt-1">
            Vai in{' '}
            <Link className="font-semibold text-grafite underline" to="/impostazioni">
              Impostazioni
            </Link>{' '}
            e sincronizza il catalogo.
          </p>
        </div>
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
                <Link
                  to={`/consulta/${encodeURIComponent(prodotto.codice)}`}
                  className="flex min-h-14 items-center gap-3 px-4 py-3 active:bg-grigio-sfondo"
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
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </Pagina>
  );
}
