import { NUMERO_LISTINI, type Impostazioni as TipoImpostazioni } from '@terminalinobru/core';
import { Eye, EyeOff, PlugZap, QrCode, RefreshCw, Save } from 'lucide-react';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { leggiStatoBridge, messaggioErrore, type StatoBridge } from '../api.js';
import { Avviso } from '../componenti/Avviso.js';
import { Pagina } from '../componenti/Pagina.js';
import { StatoRete } from '../componenti/StatoRete.js';
import { formattaDataOra, formattaNumero } from '../formato.js';
import { useImpostazioni } from '../hooks/useImpostazioni.js';
import { useOnline } from '../hooks/useOnline.js';
import {
  analizzaTestoSetup,
  validaImpostazioni,
  type ErroriImpostazioni,
} from '../impostazioni.js';
import logo from '../risorse/logo-imballare-net.png';
import { preparaAudio } from '../scanner/feedback.js';
import { Scanner } from '../scanner/Scanner.js';
import type { EsitoLettura } from '../scanner/tipi.js';
import { avviaSincronizzazione, useStatoSync } from '../sync/statoSync.js';

/** Numero con il sostantivo al singolare o al plurale. */
function quanti(numero: number, singolare: string, plurale: string): string {
  return `${formattaNumero(numero)} ${numero === 1 ? singolare : plurale}`;
}

type Messaggio = { tipo: 'conferma' | 'errore' | 'avviso'; testo: string };

function Campo({
  etichetta,
  errore,
  aiuto,
  children,
}: {
  etichetta: string;
  errore?: string | undefined;
  aiuto?: string;
  children: (id: string, descrizione: string | undefined) => ReactNode;
}) {
  const id = useId();
  const idDescrizione = errore || aiuto ? `${id}-descrizione` : undefined;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="etichetta font-semibold">
        {etichetta}
      </label>
      {children(id, idDescrizione)}
      {errore ? (
        <p id={idDescrizione} className="text-sm font-semibold text-rosso">
          {errore}
        </p>
      ) : (
        aiuto && (
          <p id={idDescrizione} className="etichetta">
            {aiuto}
          </p>
        )
      )}
    </div>
  );
}

function Interruttore({
  etichetta,
  attivo,
  onCambia,
}: {
  etichetta: string;
  attivo: boolean;
  onCambia: (valore: boolean) => void;
}) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4">
      <span>{etichetta}</span>
      <input
        type="checkbox"
        role="switch"
        className="peer sr-only"
        checked={attivo}
        onChange={(evento) => onCambia(evento.target.checked)}
      />
      <span
        aria-hidden
        className="relative h-8 w-14 shrink-0 rounded-full border border-grigio-bordo bg-grigio-sfondo transition-colors peer-checked:border-giallo-scuro peer-checked:bg-giallo peer-focus-visible:outline-2 peer-focus-visible:outline-giallo-scuro after:absolute after:top-[3px] after:left-[3px] after:size-6 after:rounded-full after:bg-bianco after:shadow after:transition-transform peer-checked:after:translate-x-6"
      />
    </label>
  );
}

export function Impostazioni() {
  const { impostazioni, salva } = useImpostazioni();
  const online = useOnline();
  const { inCorso, ultimoEsito } = useStatoSync();
  const [bozza, setBozza] = useState<TipoImpostazioni>();
  const [errori, setErrori] = useState<ErroriImpostazioni>({});
  const [tokenVisibile, setTokenVisibile] = useState(false);
  const [messaggio, setMessaggio] = useState<Messaggio>();
  const [verifica, setVerifica] = useState<
    { stato: 'in-corso' } | { stato: 'ok'; dati: StatoBridge } | { stato: 'errore'; testo: string }
  >();
  const [scannerSetup, setScannerSetup] = useState(false);
  const [erroreSetup, setErroreSetup] = useState<string>();
  const [attesaSync, setAttesaSync] = useState(false);

  // La bozza nasce dalle impostazioni salvate alla prima lettura.
  useEffect(() => {
    if (impostazioni && !bozza) setBozza(impostazioni);
  }, [impostazioni, bozza]);

  useEffect(() => {
    if (!attesaSync || inCorso || !ultimoEsito) return;
    setAttesaSync(false);
    setMessaggio(
      ultimoEsito.ok
        ? {
            tipo: 'conferma',
            testo: ultimoEsito.completa
              ? `Catalogo scaricato: ${quanti(ultimoEsito.prodottiAggiornati, 'prodotto', 'prodotti')}.`
              : `Catalogo aggiornato: ${quanti(ultimoEsito.prodottiAggiornati, 'prodotto modificato', 'prodotti modificati')}, ${quanti(ultimoEsito.prodottiEliminati, 'eliminato', 'eliminati')}.`,
          }
        : { tipo: 'errore', testo: ultimoEsito.messaggio },
    );
  }, [attesaSync, inCorso, ultimoEsito]);

  if (!bozza || !impostazioni) {
    return (
      <Pagina titolo="Impostazioni">
        <p className="etichetta">Caricamento…</p>
      </Pagina>
    );
  }

  const modificata = (Object.keys(bozza) as (keyof TipoImpostazioni)[]).some(
    (chiave) => chiave !== 'ultimaSincronizzazione' && bozza[chiave] !== impostazioni[chiave],
  );

  function cambia<K extends keyof TipoImpostazioni>(chiave: K, valore: TipoImpostazioni[K]) {
    setBozza((attuale) => (attuale ? { ...attuale, [chiave]: valore } : attuale));
    setErrori((attuali) => ({ ...attuali, [chiave]: undefined }));
    setMessaggio(undefined);
  }

  async function salvaBozza(): Promise<boolean> {
    if (!bozza) return false;
    const trovati = validaImpostazioni(bozza);
    setErrori(trovati);
    if (Object.keys(trovati).length > 0) {
      setMessaggio({ tipo: 'errore', testo: 'Correggi i campi segnati in rosso.' });
      return false;
    }
    // `ultimaSincronizzazione` la scrive solo la sync: il modulo non la tocca.
    const pulite: Partial<TipoImpostazioni> = {
      ...bozza,
      ultimaSincronizzazione: undefined,
      urlBridge: bozza.urlBridge.trim().replace(/\/+$/, ''),
      token: bozza.token.trim(),
      dispositivo: bozza.dispositivo.trim(),
    };
    try {
      await salva(pulite);
      setBozza((attuale) => (attuale ? { ...attuale, ...pulite } : attuale));
      setMessaggio({ tipo: 'conferma', testo: 'Impostazioni salvate.' });
      return true;
    } catch {
      setMessaggio({ tipo: 'errore', testo: 'Salvataggio non riuscito: riprova.' });
      return false;
    }
  }

  async function verificaConnessione() {
    if (!bozza) return;
    setVerifica({ stato: 'in-corso' });
    try {
      const dati = await leggiStatoBridge({ urlBridge: bozza.urlBridge, token: bozza.token });
      setVerifica({ stato: 'ok', dati });
    } catch (errore) {
      setVerifica({ stato: 'errore', testo: messaggioErrore(errore) });
    }
  }

  async function sincronizza() {
    if (modificata && !(await salvaBozza())) return;
    setMessaggio(undefined);
    setAttesaSync(true);
    await avviaSincronizzazione();
  }

  /** Codice letto dallo scanner del QR di setup: se valido salva la connessione e chiude. */
  async function applicaSetup(testo: string): Promise<EsitoLettura> {
    const esito = analizzaTestoSetup(testo);
    if (!esito.ok) {
      setErroreSetup(esito.errore);
      return 'sconosciuto';
    }
    try {
      await salva(esito.dati);
      setBozza((attuale) => (attuale ? { ...attuale, ...esito.dati } : attuale));
      setErrori({});
      setScannerSetup(false);
      setErroreSetup(undefined);
      setVerifica(undefined);
      setMessaggio({ tipo: 'conferma', testo: 'Connessione importata e salvata.' });
      return 'trovato';
    } catch {
      setErroreSetup('Salvataggio non riuscito: riprova.');
      return 'sconosciuto';
    }
  }

  return (
    <Pagina titolo="Impostazioni">
      {messaggio && (
        <div className="-mx-4 -mt-4">
          <Avviso tipo={messaggio.tipo}>{messaggio.testo}</Avviso>
        </div>
      )}

      <section className="card flex flex-col gap-4 p-4">
        <h2 className="text-base uppercase tracking-wide">Connessione</h2>
        <Campo
          etichetta="Indirizzo del bridge"
          errore={errori.urlBridge}
          aiuto="Lascia vuoto se l'app è aperta dall'indirizzo del bridge."
        >
          {(id, descrizione) => (
            <input
              id={id}
              aria-describedby={descrizione}
              aria-invalid={errori.urlBridge !== undefined}
              type="url"
              inputMode="url"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="https://bridge.esempio.it"
              className="campo"
              value={bozza.urlBridge}
              onChange={(e) => cambia('urlBridge', e.target.value)}
            />
          )}
        </Campo>
        <Campo etichetta="Token" errore={errori.token}>
          {(id, descrizione) => (
            <div className="flex gap-2">
              <input
                id={id}
                aria-describedby={descrizione}
                aria-invalid={errori.token !== undefined}
                type={tokenVisibile ? 'text' : 'password'}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                className="campo font-mono"
                value={bozza.token}
                onChange={(e) => cambia('token', e.target.value)}
              />
              <button
                type="button"
                className="pulsante-secondario w-12 shrink-0 px-0"
                aria-label={tokenVisibile ? 'Nascondi token' : 'Mostra token'}
                onClick={() => setTokenVisibile((v) => !v)}
              >
                {tokenVisibile ? <EyeOff size={24} /> : <Eye size={24} />}
              </button>
            </div>
          )}
        </Campo>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            className="pulsante-secondario"
            disabled={!online || verifica?.stato === 'in-corso'}
            onClick={() => void verificaConnessione()}
          >
            <PlugZap size={20} />
            {verifica?.stato === 'in-corso' ? 'Verifica…' : 'Verifica connessione'}
          </button>
          <button
            type="button"
            className="pulsante-secondario"
            onClick={() => {
              preparaAudio();
              setErroreSetup(undefined);
              setScannerSetup(true);
            }}
          >
            <QrCode size={20} />
            Importa da QR
          </button>
        </div>

        {verifica?.stato === 'ok' && (
          <dl className="rounded-[10px] border border-verde p-3" data-test="esito-verifica">
            <p className="mb-1 font-semibold text-verde">Connessione riuscita</p>
            <div className="flex justify-between gap-4">
              <dt className="etichetta">Azienda</dt>
              <dd className="text-right font-semibold">{verifica.dati.nome}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="etichetta">Ultimo catalogo</dt>
              <dd className="text-right font-semibold">
                {formattaDataOra(verifica.dati.ultimoCatalogoIl, 'mai ricevuto')}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="etichetta">Prodotti</dt>
              <dd className="text-right font-semibold tabular-nums">
                {formattaNumero(verifica.dati.prodotti)}
              </dd>
            </div>
          </dl>
        )}
        {verifica?.stato === 'errore' && (
          <p
            role="alert"
            className="rounded-[10px] border border-rosso p-3 font-semibold text-rosso"
          >
            {verifica.testo}
          </p>
        )}

        {scannerSetup && (
          <Scanner
            titolo="QR di setup"
            segnapostoManuale="Oppure incolla il testo terminalinobru://setup…"
            avviso={erroreSetup ? { tipo: 'errore', testo: erroreSetup } : undefined}
            onCodice={applicaSetup}
            onChiudi={() => {
              setScannerSetup(false);
              setErroreSetup(undefined);
            }}
          />
        )}
      </section>

      <section className="card flex flex-col gap-4 p-4">
        <h2 className="text-base uppercase tracking-wide">Catalogo</h2>
        <StatoRete />
        <button
          type="button"
          className="pulsante-primario"
          disabled={!online || inCorso}
          onClick={() => void sincronizza()}
        >
          <RefreshCw size={20} className={inCorso ? 'animate-spin' : ''} />
          {inCorso ? 'Sincronizzazione…' : 'Sincronizza catalogo'}
        </button>
      </section>

      <section className="card flex flex-col gap-4 p-4">
        <h2 className="text-base uppercase tracking-wide">File per Easyfatt</h2>
        <Campo
          etichetta="Stringa formato"
          errore={errori.stringaFormato}
          aiuto="La stessa impostata in Easyfatt per il terminale portatile, per esempio A,Q"
        >
          {(id, descrizione) => (
            <input
              id={id}
              aria-describedby={descrizione}
              aria-invalid={errori.stringaFormato !== undefined}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              className="campo font-mono"
              value={bozza.stringaFormato}
              onChange={(e) => cambia('stringaFormato', e.target.value)}
            />
          )}
        </Campo>
        <Campo etichetta="Separatore decimale">
          {(id) => (
            <select
              id={id}
              className="campo"
              value={bozza.separatoreDecimale}
              onChange={(e) => cambia('separatoreDecimale', e.target.value === ',' ? ',' : '.')}
            >
              <option value=".">Punto (1.5)</option>
              <option value=",">Virgola (1,5)</option>
            </select>
          )}
        </Campo>
      </section>

      <section className="card flex flex-col gap-4 p-4">
        <h2 className="text-base uppercase tracking-wide">Lavoro</h2>
        <Campo etichetta="Listino mostrato" errore={errori.listinoMostrato}>
          {(id, descrizione) => (
            <select
              id={id}
              aria-describedby={descrizione}
              className="campo"
              value={bozza.listinoMostrato}
              onChange={(e) => cambia('listinoMostrato', Number(e.target.value))}
            >
              {Array.from({ length: NUMERO_LISTINI }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  Listino {i + 1}
                </option>
              ))}
            </select>
          )}
        </Campo>
        <Campo etichetta="Modalità di scansione predefinita">
          {(id) => (
            <select
              id={id}
              className="campo"
              value={bozza.modalitaPredefinita}
              onChange={(e) =>
                cambia(
                  'modalitaPredefinita',
                  e.target.value === 'somma_uno' ? 'somma_uno' : 'chiedi_quantita',
                )
              }
            >
              <option value="chiedi_quantita">Chiedi la quantità</option>
              <option value="somma_uno">Somma uno a ogni lettura</option>
            </select>
          )}
        </Campo>
        <Interruttore etichetta="Suoni" attivo={bozza.suoni} onCambia={(v) => cambia('suoni', v)} />
        <Interruttore
          etichetta="Vibrazione"
          attivo={bozza.vibrazione}
          onCambia={(v) => cambia('vibrazione', v)}
        />
        <Campo
          etichetta="Nome del dispositivo"
          errore={errori.dispositivo}
          aiuto="Compare nelle sessioni inviate, per esempio Telefono magazzino"
        >
          {(id, descrizione) => (
            <input
              id={id}
              aria-describedby={descrizione}
              aria-invalid={errori.dispositivo !== undefined}
              autoComplete="off"
              maxLength={60}
              className="campo"
              value={bozza.dispositivo}
              onChange={(e) => cambia('dispositivo', e.target.value)}
            />
          )}
        </Campo>
      </section>

      {modificata && (
        <div className="sticky bottom-[calc(84px+env(safe-area-inset-bottom))] z-10">
          <button
            type="button"
            className="pulsante-primario w-full shadow-md"
            onClick={() => void salvaBozza()}
          >
            <Save size={20} />
            Salva impostazioni
          </button>
        </div>
      )}

      <footer className="flex flex-col items-center gap-1 pt-4 pb-2">
        <img src={logo} alt="imballare.net" className="h-8 w-auto" />
        <p className="etichetta">TerminalinoBru</p>
      </footer>
    </Pagina>
  );
}
