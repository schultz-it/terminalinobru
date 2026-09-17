import type { Prodotto } from '@terminalinobru/core';
import { ChevronRight, Link2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Avviso } from '../componenti/Avviso.js';
import { Pagina } from '../componenti/Pagina.js';
import { TestoEvidenziato } from '../componenti/TestoEvidenziato.js';
import { db } from '../db.js';
import { LIMITE_RISULTATI } from '../ricerca/indice.js';
import { useRicerca } from '../ricerca/useRicerca.js';
import { abbinaBarcode } from '../scanner/risolvi.js';
import { percorsoScheda } from '../scanner/useScansioneConsultazione.js';
import { useRisolviCodice } from '../scanner/useRisolviCodice.js';

/** Flusso "Abbina a un prodotto" per un barcode letto che non è nel catalogo (ARCHITETTURA 3.6). */
export function AbbinaBarcode() {
  const { barcode = '' } = useParams();
  const naviga = useNavigate();
  const [query, setQuery] = useState('');
  const [scelto, setScelto] = useState<Prodotto>();
  const [errore, setErrore] = useState<string>();
  const [salvataggio, setSalvataggio] = useState(false);
  const { risultati, pronto, totaleCatalogo } = useRicerca(query);
  const giaNoto = useRisolviCodice(barcode);

  async function conferma() {
    if (!scelto) return;
    setSalvataggio(true);
    setErrore(undefined);
    try {
      await abbinaBarcode(db, barcode, scelto.codice);
      void naviga(percorsoScheda(scelto.codice), { replace: true });
    } catch {
      setErrore('Abbinamento non salvato: riprova.');
      setSalvataggio(false);
    }
  }

  return (
    <Pagina titolo="Codice sconosciuto" indietro="/consulta">
      {errore && (
        <div className="-mx-4 -mt-4">
          <Avviso tipo="errore">{errore}</Avviso>
        </div>
      )}

      <section className="card p-4">
        <p className="etichetta">Codice letto</p>
        <p className="font-mono text-xl font-bold break-all">{barcode}</p>
        {giaNoto ? (
          <p className="mt-2">
            Questo codice ora è abbinato a{' '}
            <Link className="font-semibold underline" to={percorsoScheda(giaNoto.codice)}>
              {giaNoto.codice}
            </Link>
            .
          </p>
        ) : (
          <p className="mt-2">
            Non è nel catalogo del telefono. Cerca il prodotto giusto per abbinarlo: l’abbinamento
            vale subito qui e viene messo in coda per l’invio al bridge.
          </p>
        )}
      </section>

      {scelto ? (
        <section className="card flex flex-col gap-3 border-giallo-scuro p-4">
          <h2 className="text-base tracking-wide uppercase">Abbina a un prodotto</h2>
          <p>
            <span className="font-mono font-semibold break-all">{barcode}</span> →{' '}
            <span className="font-titolo font-bold break-all">{scelto.codice}</span>
          </p>
          <p>{scelto.descrizione}</p>
          <button
            type="button"
            className="pulsante-primario"
            disabled={salvataggio}
            onClick={() => void conferma()}
          >
            <Link2 size={20} />
            {salvataggio ? 'Salvataggio…' : 'Abbina'}
          </button>
          <button
            type="button"
            className="pulsante-secondario"
            disabled={salvataggio}
            onClick={() => setScelto(undefined)}
          >
            Scegli un altro prodotto
          </button>
        </section>
      ) : (
        <>
          <label className="sr-only" htmlFor="ricerca-abbina">
            Cerca il prodotto da abbinare
          </label>
          <input
            id="ricerca-abbina"
            type="search"
            inputMode="search"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="search"
            placeholder="Cerca il prodotto per codice o descrizione"
            className="campo"
            value={query}
            onChange={(evento) => setQuery(evento.target.value)}
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
                      onClick={() => setScelto(prodotto)}
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
        </>
      )}
    </Pagina>
  );
}
