import type { Impostazioni, StatoSessione } from '@terminalinobru/core';
import { ChevronDown, Download, Eye, RefreshCw, RotateCcw, Send } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { chiamaBridge, messaggioErrore, type Connessione } from '../api.js';
import { Avviso } from '../componenti/Avviso.js';
import { ChipStato } from '../componenti/ChipStato.js';
import { IconaTipo } from '../componenti/IconaTipo.js';
import { Pagina } from '../componenti/Pagina.js';
import { db } from '../db.js';
import { nomeFileDaIntestazione, scaricaBlob } from '../esportazioni/download.js';
import { FILTRO_STATO_DEFAULT, filtraSessioni, STATI_FILTRO } from '../esportazioni/filtri.js';
import { ISTRUZIONI_IMPORTAZIONE } from '../esportazioni/istruzioni.js';
import { formattaDataOra, formattaNumero } from '../formato.js';
import { useImpostazioni } from '../hooks/useImpostazioni.js';
import { useLiveQuery } from '../hooks/useLiveQuery.js';
import { ETICHETTE_STATO, ETICHETTE_TIPO } from '../sessioni/modello.js';
import { avviaInvioCoda, useStatoCoda } from '../sync/coda.js';
import { allineaSessioniLocali, elencoSessioniBridge, type SessioneBridge } from '../sync/sessioni.js';

type StatoElenco = { caricamento: boolean; sessioni?: SessioneBridge[]; errore?: string };

/** Elenco delle sessioni sul bridge, ricaricabile a mano; usata anche dopo ogni azione. */
function useElencoBridge(connessione: Connessione | undefined) {
  const [stato, setStato] = useState<StatoElenco>({ caricamento: true });
  const ricarica = useCallback(async () => {
    if (!connessione) return;
    setStato({ caricamento: true });
    try {
      const sessioni = await elencoSessioniBridge(connessione);
      setStato({ caricamento: false, sessioni });
    } catch (errore) {
      setStato({ caricamento: false, errore: messaggioErrore(errore) });
    }
  }, [connessione?.urlBridge, connessione?.token]);
  useEffect(() => {
    void ricarica();
  }, [ricarica]);
  return { ...stato, ricarica };
}

type StatoBarcodeNuovi = { caricamento: boolean; conteggio?: number; errore?: string };

/** Conteggio degli abbinamenti barcode creati in app, da `GET /api/barcode/nuovi.csv`. */
function useBarcodeNuovi(connessione: Connessione | undefined) {
  const [stato, setStato] = useState<StatoBarcodeNuovi>({ caricamento: true });
  const ricarica = useCallback(async () => {
    if (!connessione) return;
    setStato({ caricamento: true });
    try {
      const risposta = await chiamaBridge(connessione, '/api/barcode/nuovi.csv');
      const testo = await risposta.text();
      const righe = testo.split(/\r?\n/).filter((riga) => riga.trim() !== '');
      setStato({ caricamento: false, conteggio: Math.max(righe.length - 1, 0) });
    } catch (errore) {
      setStato({ caricamento: false, errore: messaggioErrore(errore) });
    }
  }, [connessione?.urlBridge, connessione?.token]);
  useEffect(() => {
    void ricarica();
  }, [ricarica]);
  return { ...stato, ricarica };
}

type StatoAnteprima = { aperta: boolean; caricamento?: boolean; testo?: string; errore?: string };
type StatoAzione = { tipo: 'scarico' | 'stato'; errore?: string } | undefined;

/** Azioni disponibili su una sessione: scarico, anteprima e cambio stato, con il loro stato UI. */
function useAzioniSessione(
  connessione: Connessione,
  sessione: SessioneBridge,
  dopoModifica: () => void,
) {
  const [anteprima, setAnteprima] = useState<StatoAnteprima>({ aperta: false });
  const [azione, setAzione] = useState<StatoAzione>(undefined);

  async function scarica() {
    setAzione({ tipo: 'scarico' });
    try {
      const risposta = await chiamaBridge(connessione, `/api/sessioni/${sessione.id}/terminale.txt`);
      const blob = await risposta.blob();
      const nome = nomeFileDaIntestazione(
        risposta.headers.get('content-disposition'),
        `terminale-${sessione.tipo}-${sessione.id}.txt`,
      );
      scaricaBlob(nome, blob);
      setAzione(undefined);
      dopoModifica();
    } catch (errore) {
      setAzione({ tipo: 'scarico', errore: messaggioErrore(errore) });
    }
  }

  async function alternaAnteprima() {
    if (anteprima.aperta) {
      setAnteprima({ aperta: false });
      return;
    }
    setAnteprima({ aperta: true, caricamento: true });
    try {
      const risposta = await chiamaBridge(
        connessione,
        `/api/sessioni/${sessione.id}/terminale.txt?soloAnteprima=1`,
      );
      setAnteprima({ aperta: true, testo: await risposta.text() });
    } catch (errore) {
      setAnteprima({ aperta: true, errore: messaggioErrore(errore) });
    }
  }

  async function cambiaStato(nuovo: 'importata' | 'chiusa') {
    setAzione({ tipo: 'stato' });
    try {
      await chiamaBridge(connessione, `/api/sessioni/${sessione.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stato: nuovo }),
      });
      setAzione(undefined);
      dopoModifica();
    } catch (errore) {
      setAzione({ tipo: 'stato', errore: messaggioErrore(errore) });
    }
  }

  return { anteprima, azione, scarica, alternaAnteprima, cambiaStato };
}

function RiquadroAnteprima({ anteprima }: { anteprima: StatoAnteprima }) {
  if (!anteprima.aperta) return null;
  return (
    <div className="rounded-[10px] border border-grigio-bordo bg-grigio-sfondo p-3">
      {anteprima.caricamento && <p className="etichetta">Caricamento…</p>}
      {anteprima.errore && <p className="text-sm font-semibold text-rosso">{anteprima.errore}</p>}
      {anteprima.testo !== undefined && (
        <pre className="max-h-64 overflow-auto font-mono text-sm whitespace-pre-wrap">
          {anteprima.testo || '(file vuoto)'}
        </pre>
      )}
    </div>
  );
}

function AzioniSessione({
  connessione,
  sessione,
  dopoModifica,
}: {
  connessione: Connessione;
  sessione: SessioneBridge;
  dopoModifica: () => void;
}) {
  const { anteprima, azione, scarica, alternaAnteprima, cambiaStato } = useAzioniSessione(
    connessione,
    sessione,
    dopoModifica,
  );
  const inCorso = azione !== undefined;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="pulsante-primario min-h-10 px-3 text-sm"
          disabled={inCorso}
          onClick={() => void scarica()}
        >
          <Download size={18} />
          Scarica terminale.txt
        </button>
        <button
          type="button"
          className="pulsante-secondario min-h-10 px-3 text-sm"
          disabled={inCorso}
          onClick={() => void alternaAnteprima()}
        >
          <Eye size={18} />
          {anteprima.aperta ? 'Nascondi anteprima' : 'Anteprima'}
        </button>
        {sessione.stato === 'esportata' && (
          <>
            <button
              type="button"
              className="pulsante-secondario min-h-10 px-3 text-sm"
              disabled={inCorso}
              onClick={() => void cambiaStato('importata')}
            >
              Segna come importata
            </button>
            <button
              type="button"
              className="pulsante-secondario min-h-10 px-3 text-sm"
              disabled={inCorso}
              onClick={() => void cambiaStato('chiusa')}
            >
              <RotateCcw size={18} />
              Riporta a chiusa
            </button>
          </>
        )}
      </div>
      {azione?.errore && <p className="text-sm font-semibold text-rosso">{azione.errore}</p>}
      <RiquadroAnteprima anteprima={anteprima} />
    </div>
  );
}

function SchedaSessione({
  connessione,
  sessione,
  dopoModifica,
}: {
  connessione: Connessione;
  sessione: SessioneBridge;
  dopoModifica: () => void;
}) {
  return (
    <li className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-giallo-chiaro text-nero">
          <IconaTipo tipo={sessione.tipo} />
        </span>
        <div className="min-w-0 flex-1">
          <span className="block font-bold break-words">{sessione.nome}</span>
          <span className="etichetta block">
            {ETICHETTE_TIPO[sessione.tipo]} · chiusa il {formattaDataOra(sessione.chiusaIl)}
          </span>
          {sessione.dispositivo && (
            <span className="etichetta block">Dispositivo: {sessione.dispositivo}</span>
          )}
          <span className="etichetta block">
            {formattaNumero(sessione.conteggioRighe)} righe · {formattaNumero(sessione.sommaQuantita)}{' '}
            pezzi
          </span>
        </div>
        <ChipStato stato={sessione.stato} />
      </div>
      <AzioniSessione connessione={connessione} sessione={sessione} dopoModifica={dopoModifica} />
    </li>
  );
}

function RigaTabella({
  connessione,
  sessione,
  dopoModifica,
}: {
  connessione: Connessione;
  sessione: SessioneBridge;
  dopoModifica: () => void;
}) {
  return (
    <>
      <tr>
        <td className="px-3 py-3">
          <span className="inline-flex items-center gap-2">
            <IconaTipo tipo={sessione.tipo} size={20} />
            {ETICHETTE_TIPO[sessione.tipo]}
          </span>
        </td>
        <td className="max-w-56 truncate px-3 py-3 font-semibold">{sessione.nome}</td>
        <td className="px-3 py-3 whitespace-nowrap">{formattaDataOra(sessione.chiusaIl)}</td>
        <td className="px-3 py-3">{sessione.dispositivo ?? '—'}</td>
        <td className="px-3 py-3 text-right tabular-nums">
          {formattaNumero(sessione.conteggioRighe)}
        </td>
        <td className="px-3 py-3 text-right tabular-nums">
          {formattaNumero(sessione.sommaQuantita)}
        </td>
        <td className="px-3 py-3">
          <ChipStato stato={sessione.stato} />
        </td>
      </tr>
      <tr>
        <td colSpan={7} className="px-3 pb-3">
          <AzioniSessione connessione={connessione} sessione={sessione} dopoModifica={dopoModifica} />
        </td>
      </tr>
    </>
  );
}

function FiltroStato({
  filtro,
  onCambia,
}: {
  filtro: ReadonlySet<StatoSessione>;
  onCambia: (filtro: ReadonlySet<StatoSessione>) => void;
}) {
  function alterna(stato: StatoSessione) {
    const nuovo = new Set(filtro);
    if (nuovo.has(stato)) nuovo.delete(stato);
    else nuovo.add(stato);
    onCambia(nuovo);
  }
  return (
    <div className="flex flex-wrap gap-2">
      {STATI_FILTRO.map((stato) => {
        const attivo = filtro.has(stato);
        return (
          <button
            key={stato}
            type="button"
            aria-pressed={attivo}
            className={
              attivo
                ? 'min-h-10 rounded-full bg-giallo px-3 text-sm font-semibold text-nero'
                : 'min-h-10 rounded-full border border-grigio-bordo bg-bianco px-3 text-sm font-semibold text-grafite'
            }
            onClick={() => alterna(stato)}
          >
            {ETICHETTE_STATO[stato]}
          </button>
        );
      })}
    </div>
  );
}

function RiquadroIstruzioni() {
  return (
    <details className="card p-4">
      <summary className="flex cursor-pointer items-center justify-between font-semibold">
        Dove si importa in Easyfatt
        <ChevronDown size={20} className="text-grigio-testo" />
      </summary>
      <dl className="mt-3 flex flex-col gap-3">
        {(Object.keys(ISTRUZIONI_IMPORTAZIONE) as (keyof typeof ISTRUZIONI_IMPORTAZIONE)[]).map(
          (tipo) => (
            <div key={tipo}>
              <dt className="font-semibold">{ETICHETTE_TIPO[tipo]}</dt>
              <dd className="etichetta">{ISTRUZIONI_IMPORTAZIONE[tipo]}</dd>
            </div>
          ),
        )}
      </dl>
    </details>
  );
}

function SezioneBarcodeNuovi({ connessione }: { connessione: Connessione }) {
  const { caricamento, conteggio, errore, ricarica } = useBarcodeNuovi(connessione);
  const [scarico, setScarico] = useState<string>();

  async function scaricaCsv() {
    setScarico(undefined);
    try {
      const risposta = await chiamaBridge(connessione, '/api/barcode/nuovi.csv');
      const blob = await risposta.blob();
      const nome = nomeFileDaIntestazione(
        risposta.headers.get('content-disposition'),
        'barcode-nuovi.csv',
      );
      scaricaBlob(nome, blob);
    } catch (errore_) {
      setScarico(messaggioErrore(errore_));
    }
  }

  return (
    <section className="card flex flex-col gap-3 p-4">
      <h2 className="text-base tracking-wide uppercase">Barcode abbinati in app</h2>
      {caricamento && !errore && <p className="etichetta">Caricamento…</p>}
      {errore && <p className="text-sm font-semibold text-rosso">{errore}</p>}
      {conteggio !== undefined && (
        <p>
          <span className="text-2xl font-bold tabular-nums">{formattaNumero(conteggio)}</span>{' '}
          <span className="etichetta">
            {conteggio === 1 ? 'abbinamento' : 'abbinamenti'} non ancora in Easyfatt
          </span>
        </p>
      )}
      <p className="etichetta">
        Sono i barcode letti in app e non riconosciuti, abbinati a un codice prodotto sul telefono.
        Riportali in Easyfatt nella scheda del prodotto (campo barcode aggiuntivi) oppure con
        l&apos;importazione prodotti da Excel, poi la prossima sincronizzazione del catalogo li farà
        sparire da qui.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="pulsante-secondario"
          disabled={caricamento || conteggio === 0}
          onClick={() => void scaricaCsv()}
        >
          <Download size={18} />
          Scarica CSV
        </button>
        <button type="button" className="pulsante-secondario" onClick={() => void ricarica()}>
          <RefreshCw size={18} />
          Aggiorna
        </button>
      </div>
      {scarico && <p className="text-sm font-semibold text-rosso">{scarico}</p>}
    </section>
  );
}

/** Sessioni da inviare al bridge, per l'avviso in cima alla pagina. */
function useVociInCoda(): number {
  return useLiveQuery(() => db.codaUpload.count(), []) ?? 0;
}

function connessioneDa(impostazioni: Impostazioni | undefined): Connessione | undefined {
  if (!impostazioni || impostazioni.token.trim() === '') return undefined;
  return { urlBridge: impostazioni.urlBridge, token: impostazioni.token };
}

export function Esportazioni() {
  const { impostazioni } = useImpostazioni();
  const connessione = connessioneDa(impostazioni);
  const { caricamento, sessioni, errore, ricarica } = useElencoBridge(connessione);
  const [filtro, setFiltro] = useState<ReadonlySet<StatoSessione>>(FILTRO_STATO_DEFAULT);
  const vociInCoda = useVociInCoda();
  const coda = useStatoCoda();

  // Allineamento di sola lettura all'apertura della pagina (docs/ARCHITETTURA.md, T08).
  useEffect(() => {
    if (!connessione) return;
    void allineaSessioniLocali({ db, impostazioni: connessione });
  }, [connessione?.urlBridge, connessione?.token]);

  const elenco = sessioni ? filtraSessioni(sessioni, filtro) : undefined;

  return (
    <Pagina
      titolo="Esportazioni"
      larga
      azione={
        <button
          type="button"
          aria-label="Aggiorna elenco"
          className="flex size-12 items-center justify-center rounded-full active:bg-giallo-scuro"
          disabled={caricamento}
          onClick={() => void ricarica()}
        >
          <RefreshCw size={22} className={caricamento ? 'animate-spin' : ''} />
        </button>
      }
    >
      {!connessione && (
        <Avviso tipo="avviso">
          Imposta indirizzo del bridge e token nelle Impostazioni per vedere le sessioni.
        </Avviso>
      )}

      {vociInCoda > 0 && (
        <div className="-mx-4 -mt-4 flex items-center gap-2 bg-arancio pr-2">
          <div className="min-w-0 flex-1">
            <Avviso tipo="avviso">
              {vociInCoda === 1
                ? '1 invio in attesa verso il bridge'
                : `${vociInCoda} invii in attesa verso il bridge`}
            </Avviso>
          </div>
          <button
            type="button"
            className="pulsante-secondario shrink-0"
            disabled={coda.inCorso}
            onClick={() => void avviaInvioCoda().then(ricarica)}
          >
            <Send size={20} />
            {coda.inCorso ? 'Invio…' : 'Invia ora'}
          </button>
        </div>
      )}

      {connessione && (
        <>
          <RiquadroIstruzioni />

          <FiltroStato filtro={filtro} onCambia={setFiltro} />

          {errore && <Avviso tipo="errore">{errore}</Avviso>}
          {caricamento && !sessioni && <p className="etichetta">Caricamento…</p>}
          {elenco && elenco.length === 0 && (
            <p className="etichetta">Nessuna sessione con questo filtro.</p>
          )}

          {elenco && elenco.length > 0 && (
            <div className="card overflow-hidden">
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[760px] text-left">
                  <thead className="bg-grigio-sfondo text-sm text-grigio-testo">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Tipo</th>
                      <th className="px-3 py-2 font-semibold">Nome</th>
                      <th className="px-3 py-2 font-semibold">Chiusa il</th>
                      <th className="px-3 py-2 font-semibold">Dispositivo</th>
                      <th className="px-3 py-2 text-right font-semibold">Righe</th>
                      <th className="px-3 py-2 text-right font-semibold">Pezzi</th>
                      <th className="px-3 py-2 font-semibold">Stato</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-grigio-bordo">
                    {elenco.map((sessione) => (
                      <RigaTabella
                        key={sessione.id}
                        connessione={connessione}
                        sessione={sessione}
                        dopoModifica={() => void ricarica()}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="divide-y divide-grigio-bordo md:hidden">
                {elenco.map((sessione) => (
                  <SchedaSessione
                    key={sessione.id}
                    connessione={connessione}
                    sessione={sessione}
                    dopoModifica={() => void ricarica()}
                  />
                ))}
              </ul>
            </div>
          )}

          <SezioneBarcodeNuovi connessione={connessione} />
        </>
      )}
    </Pagina>
  );
}
