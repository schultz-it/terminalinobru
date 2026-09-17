import {
  cercaClienti,
  clienteDocumento,
  costruisciIndiceClienti,
  type CampoCliente,
  type ClienteDocumento,
} from '@terminalinobru/core';
import { ArrowLeft, ChevronRight, Save, UserPlus } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  CAMPI_NUOVO_CLIENTE,
  creaClienteApp,
  type CampoNuovoCliente,
} from '../clienti/operazioni.js';
import { db } from '../db.js';
import { useLiveQuery } from '../hooks/useLiveQuery.js';
import { Avviso } from './Avviso.js';
import { TestoEvidenziato } from './TestoEvidenziato.js';

/** Numero massimo di clienti mostrati mentre si digita. */
export const LIMITE_RISULTATI_CLIENTI = 30;

/** Schermo intero con barra gialla, come la ricerca prodotto. */
function Sovrapposto({
  titolo,
  onIndietro,
  etichettaIndietro,
  children,
}: {
  titolo: string;
  onIndietro: () => void;
  etichettaIndietro: string;
  children: ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={titolo}
      className="fixed inset-0 z-[60] flex flex-col bg-grigio-sfondo text-grafite"
    >
      <header className="bg-giallo pt-[env(safe-area-inset-top)] text-nero">
        <div className="flex h-14 items-center gap-1 px-2">
          <button
            type="button"
            aria-label={etichettaIndietro}
            className="flex size-12 items-center justify-center rounded-full active:bg-giallo-scuro"
            onClick={onIndietro}
          >
            <ArrowLeft size={28} strokeWidth={2} />
          </button>
          <h2 className="text-lg tracking-wide uppercase">{titolo}</h2>
        </div>
      </header>
      <div className="mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col gap-3 overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {children}
      </div>
    </div>
  );
}

/**
 * Ricerca del cliente di un DDT per nome, codice o partita IVA, con un tocco per sceglierlo, e
 * modulo "Nuovo cliente" per chi Easyfatt non conosce ancora. Restituisce la copia dei campi che
 * viaggia nella sessione.
 */
export function SceltaCliente({
  onScegli,
  onChiudi,
}: {
  onScegli: (cliente: ClienteDocumento) => void;
  onChiudi: () => void;
}) {
  const [nuovo, setNuovo] = useState(false);
  if (nuovo) {
    return (
      <ModuloNuovoCliente
        onCreato={(cliente) => onScegli(cliente)}
        onAnnulla={() => setNuovo(false)}
      />
    );
  }
  return <RicercaCliente onScegli={onScegli} onChiudi={onChiudi} onNuovo={() => setNuovo(true)} />;
}

function RicercaCliente({
  onScegli,
  onChiudi,
  onNuovo,
}: {
  onScegli: (cliente: ClienteDocumento) => void;
  onChiudi: () => void;
  onNuovo: () => void;
}) {
  const [query, setQuery] = useState('');
  const clienti = useLiveQuery(() => db.clienti.toArray(), []);
  // Indice in memoria, ricostruito solo quando i clienti nel telefono cambiano.
  const indice = useMemo(() => (clienti ? costruisciIndiceClienti(clienti) : undefined), [clienti]);
  const risultati = useMemo(
    () => (indice ? cercaClienti(indice, query, LIMITE_RISULTATI_CLIENTI) : []),
    [indice, query],
  );
  const daEasyfatt = clienti?.filter((cliente) => cliente.origine === 'easyfatt').length ?? 0;
  const campo = useRef<HTMLInputElement>(null);
  useEffect(() => campo.current?.focus(), []);

  return (
    <Sovrapposto titolo="Scegli cliente" etichettaIndietro="Chiudi ricerca" onIndietro={onChiudi}>
      <label className="sr-only" htmlFor="ricerca-cliente">
        Cerca per nome, codice o partita IVA
      </label>
      <input
        ref={campo}
        id="ricerca-cliente"
        type="search"
        inputMode="search"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        placeholder="Nome, codice o partita IVA"
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
      <button type="button" className="pulsante-secondario" onClick={onNuovo}>
        <UserPlus size={20} />
        Nuovo cliente
      </button>
      {clienti && daEasyfatt === 0 && (
        <p className="rounded-xl border border-arancio bg-arancio/15 p-3">
          Nessun cliente di Easyfatt nel telefono. Dal PC caricali in{' '}
          <strong>Esportazioni &gt; Clienti</strong>, poi sincronizza. Intanto puoi creare un nuovo
          cliente.
        </p>
      )}
      {query.trim() !== '' && indice && indice.voci.length > 0 && (
        <>
          <p className="etichetta" aria-live="polite">
            {risultati.length === 0
              ? 'Nessun cliente trovato.'
              : risultati.length === LIMITE_RISULTATI_CLIENTI
                ? `Primi ${LIMITE_RISULTATI_CLIENTI} risultati: aggiungi parole per restringere.`
                : `${risultati.length} ${risultati.length === 1 ? 'risultato' : 'risultati'}`}
          </p>
          {risultati.length > 0 && (
            <ul className="card divide-y divide-grigio-bordo overflow-hidden">
              {risultati.map((cliente) => (
                <li key={cliente.id}>
                  <button
                    type="button"
                    className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left active:bg-grigio-sfondo"
                    onClick={() => onScegli(clienteDocumento(cliente))}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold break-words">
                        <TestoEvidenziato testo={cliente.nome} query={query} />
                      </span>
                      <span className="etichetta block">
                        {cliente.origine === 'app' ? (
                          'Creato sul telefono'
                        ) : (
                          <>
                            Cod. <TestoEvidenziato testo={cliente.codice ?? ''} query={query} />
                          </>
                        )}
                        {cliente.partitaIva && (
                          <>
                            {' · P.IVA '}
                            <TestoEvidenziato testo={cliente.partitaIva} query={query} />
                          </>
                        )}
                        {cliente.citta && ` · ${cliente.citta}`}
                      </span>
                    </span>
                    <ChevronRight size={24} className="shrink-0 text-grigio-testo" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Sovrapposto>
  );
}

/** Etichette e tastiere dei campi del modulo "Nuovo cliente". */
const CAMPI: Record<
  CampoNuovoCliente,
  {
    etichetta: string;
    tipo?: 'email' | 'tel';
    inputMode?: 'numeric' | 'email' | 'tel';
    maiuscole?: boolean;
    aiuto?: string;
  }
> = {
  nome: { etichetta: 'Ragione sociale' },
  partitaIva: {
    etichetta: 'Partita IVA',
    maiuscole: true,
    aiuto: '11 cifre, oppure sigla del paese e numero per i clienti esteri',
  },
  codiceFiscale: { etichetta: 'Codice fiscale', maiuscole: true },
  indirizzo: { etichetta: 'Indirizzo' },
  cap: { etichetta: 'CAP', inputMode: 'numeric' },
  citta: { etichetta: 'Città' },
  provincia: {
    etichetta: 'Provincia',
    maiuscole: true,
    aiuto: 'Sigla di 2 lettere, per esempio FC',
  },
  sdi: {
    etichetta: 'Codice destinatario SDI',
    aiuto: '7 caratteri, oppure la PEC se il cliente non ha il codice',
  },
  telefono: { etichetta: 'Telefono', tipo: 'tel', inputMode: 'tel' },
  email: { etichetta: 'Email', tipo: 'email', inputMode: 'email' },
};

function ModuloNuovoCliente({
  onCreato,
  onAnnulla,
}: {
  onCreato: (cliente: ClienteDocumento) => void;
  onAnnulla: () => void;
}) {
  const idModulo = useId();
  const [valori, setValori] = useState<Partial<Record<CampoNuovoCliente, string>>>({});
  const [errori, setErrori] = useState<Partial<Record<CampoCliente, string>>>({});
  const [erroreGenerale, setErroreGenerale] = useState<string>();
  const [salvataggio, setSalvataggio] = useState(false);

  async function salva() {
    setSalvataggio(true);
    setErroreGenerale(undefined);
    try {
      const esito = await creaClienteApp(db, valori);
      if (esito.ok) {
        onCreato(clienteDocumento(esito.cliente));
        return;
      }
      setErrori(esito.errori);
      setErroreGenerale('Correggi i campi segnati in rosso.');
    } catch {
      setErroreGenerale('Cliente non salvato: riprova.');
    }
    setSalvataggio(false);
  }

  return (
    <Sovrapposto
      titolo="Nuovo cliente"
      etichettaIndietro="Torna alla ricerca"
      onIndietro={onAnnulla}
    >
      {erroreGenerale && (
        <div className="-mx-4 -mt-4">
          <Avviso tipo="errore">{erroreGenerale}</Avviso>
        </div>
      )}
      <p className="etichetta">
        Per un cliente che Easyfatt non ha ancora. Al primo scarico dell&apos;ordine Easyfatt lo
        riconosce da partita IVA, codice fiscale o email, oppure crea l&apos;anagrafica.
      </p>
      <form
        id={idModulo}
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(evento) => {
          evento.preventDefault();
          void salva();
        }}
      >
        {CAMPI_NUOVO_CLIENTE.map((nome) => {
          const campo = CAMPI[nome];
          const id = `${idModulo}-${nome}`;
          const errore = errori[nome];
          const descrizione = errore ?? campo.aiuto;
          return (
            <div key={nome} className="flex flex-col gap-1">
              <label htmlFor={id} className="etichetta font-semibold">
                {campo.etichetta}
                {nome === 'nome' ? ' (obbligatoria)' : ''}
              </label>
              <input
                id={id}
                name={nome}
                type={campo.tipo ?? 'text'}
                inputMode={campo.inputMode}
                autoComplete="off"
                autoCapitalize={campo.maiuscole ? 'characters' : 'sentences'}
                spellCheck={false}
                required={nome === 'nome'}
                aria-invalid={errore !== undefined}
                aria-describedby={descrizione ? `${id}-descrizione` : undefined}
                className="campo"
                value={valori[nome] ?? ''}
                onChange={(evento) => {
                  const valore = evento.target.value;
                  setValori((attuali) => ({ ...attuali, [nome]: valore }));
                  if (errore) setErrori(({ [nome]: _tolto, ...resto }) => resto);
                }}
              />
              {descrizione && (
                <p
                  id={`${id}-descrizione`}
                  className={errore ? 'text-sm font-semibold text-rosso' : 'etichetta'}
                >
                  {descrizione}
                </p>
              )}
            </div>
          );
        })}
        <button type="submit" className="pulsante-primario" disabled={salvataggio}>
          <Save size={20} />
          {salvataggio ? 'Salvataggio…' : 'Salva e scegli'}
        </button>
      </form>
    </Sovrapposto>
  );
}
