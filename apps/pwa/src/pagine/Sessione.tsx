import { arrotondaQuantita, type Prodotto, type Riga } from '@terminalinobru/core';
import { ErroreFileTerminale } from '@terminalinobru/easyfatt';
import { CheckCheck, Pencil, RotateCcw, Search, Send, Share2, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { Avviso } from '../componenti/Avviso.js';
import { ChipStato } from '../componenti/ChipStato.js';
import { Dialogo } from '../componenti/Dialogo.js';
import { FoglioQuantita } from '../componenti/FoglioQuantita.js';
import { Pagina } from '../componenti/Pagina.js';
import { Riepilogo } from '../componenti/Riepilogo.js';
import { RicercaProdotto } from '../componenti/RicercaProdotto.js';
import { db, type SessioneLocale } from '../db.js';
import { formattaDataOra, formattaNumero } from '../formato.js';
import { useImpostazioni } from '../hooks/useImpostazioni.js';
import { useLiveQuery } from '../hooks/useLiveQuery.js';
import { risolviCodice } from '../scanner/risolvi.js';
import { Scanner, type EsitoLettura, type SorgenteLettura } from '../scanner/Scanner.js';
import { condividiFileTerminale } from '../sessioni/file.js';
import { ETICHETTE_MODALITA, ETICHETTE_TIPO } from '../sessioni/modello.js';
import {
  aggiungiRiga,
  cancellaRiga,
  chiudiSessione,
  ErroreSessione,
  modificaQuantita,
  riapriSessione,
  righeSessione,
} from '../sessioni/operazioni.js';
import { calcolaRiepilogo } from '../sessioni/riepilogo.js';
import { avviaInvioCoda, useStatoCoda } from '../sync/coda.js';

/** Stato passato dal flusso di abbinamento quando torna alla sessione. */
export type StatoRitornoAbbinamento = { abbinato: { codiceProdotto: string; barcode: string } };

/** Percorso del flusso di abbinamento di un codice sconosciuto letto in una sessione. */
export function percorsoAbbinaInSessione(barcode: string, sessioneId: string): string {
  return `/consulta/abbina/${encodeURIComponent(barcode)}?sessione=${encodeURIComponent(sessioneId)}`;
}

function messaggio(errore: unknown): string {
  if (errore instanceof ErroreSessione || errore instanceof ErroreFileTerminale) {
    return errore.message;
  }
  return 'Operazione non riuscita: riprova.';
}

/** Quantità scritta come la si digita sul tastierino, con la virgola. */
function testoQuantita(quantita: number): string {
  return String(quantita).replace('.', ',');
}

/** Prodotti del catalogo citati dalle righe, per codice. */
function useProdottiRighe(righe: readonly Riga[] | undefined): Map<string, Prodotto> {
  const codici = useMemo(
    () => [...new Set((righe ?? []).map((riga) => riga.codiceProdotto))].sort(),
    [righe],
  );
  const chiave = codici.join('\n');
  const prodotti = useLiveQuery(() => db.prodotti.bulkGet(codici), [chiave]);
  return useMemo(() => {
    const mappa = new Map<string, Prodotto>();
    for (const prodotto of prodotti ?? []) if (prodotto) mappa.set(prodotto.codice, prodotto);
    return mappa;
  }, [prodotti]);
}

export function Sessione() {
  const { id = '' } = useParams();
  const sessione = useLiveQuery(async () => (await db.sessioni.get(id)) ?? null, [id]);
  const righe = useLiveQuery(() => righeSessione(db, id), [id]);

  if (sessione === undefined || righe === undefined) {
    return (
      <Pagina titolo="Sessione" indietro="/">
        <p className="etichetta">Caricamento…</p>
      </Pagina>
    );
  }
  if (sessione === null) {
    return (
      <Pagina titolo="Sessione" indietro="/">
        <div className="card p-4">
          <p className="font-semibold">Sessione non trovata sul telefono.</p>
          <p className="etichetta mt-1">Potrebbe essere stata cancellata con la pulizia.</p>
        </div>
      </Pagina>
    );
  }
  return sessione.stato === 'aperta' ? (
    <SessioneAperta sessione={sessione} righe={righe} />
  ) : (
    <SessioneChiusa sessione={sessione} righe={righe} />
  );
}

type Foglio =
  { tipo: 'nuova'; prodotto: Prodotto; barcodeLetto?: string } | { tipo: 'modifica'; riga: Riga };

type Messaggio = { tipo: 'conferma' | 'errore' | 'avviso'; testo: string };

function SessioneAperta({ sessione, righe }: { sessione: SessioneLocale; righe: Riga[] }) {
  const naviga = useNavigate();
  const posizione = useLocation();
  const prodotti = useProdottiRighe(righe);
  const [fase, setFase] = useState<'lavoro' | 'riepilogo'>('lavoro');
  const [foglio, setFoglio] = useState<Foglio>();
  const [ricerca, setRicerca] = useState<{ query: string }>();
  const [daCancellare, setDaCancellare] = useState<Riga>();
  const [avviso, setAvviso] = useState<Messaggio>();
  const [erroreChiusura, setErroreChiusura] = useState<string>();
  const [chiusura, setChiusura] = useState(false);
  const inventario = sessione.tipo === 'inventario';

  const totali = useMemo(() => {
    const mappa = new Map<string, number>();
    for (const riga of righe) {
      mappa.set(riga.codiceProdotto, (mappa.get(riga.codiceProdotto) ?? 0) + riga.quantita);
    }
    return mappa;
  }, [righe]);
  const totale = (codice: string) => arrotondaQuantita(totali.get(codice) ?? 0);

  // Le letture arrivano dallo scanner anche con un foglio aperto: servono i valori correnti.
  const sovrapposto = foglio !== undefined || ricerca !== undefined || daCancellare !== undefined;
  const sovrappostoRef = useRef(sovrapposto);
  sovrappostoRef.current = sovrapposto;

  const inserisci = useCallback(
    async (prodotto: Prodotto, barcodeLetto?: string): Promise<EsitoLettura> => {
      if (sessione.modalita === 'somma_uno') {
        await aggiungiRiga(db, sessione.id, {
          codiceProdotto: prodotto.codice,
          quantita: 1,
          ...(barcodeLetto ? { barcodeLetto } : {}),
        });
        setAvviso(undefined);
        return 'trovato';
      }
      setFoglio({ tipo: 'nuova', prodotto, ...(barcodeLetto ? { barcodeLetto } : {}) });
      return 'trovato';
    },
    [sessione.id, sessione.modalita],
  );

  const onCodice = async (codice: string, sorgente: SorgenteLettura): Promise<EsitoLettura> => {
    if (sovrappostoRef.current) {
      setAvviso({ tipo: 'errore', testo: 'Prima conferma o annulla la finestra aperta.' });
      return 'sconosciuto';
    }
    try {
      const prodotto = await risolviCodice(db, codice);
      if (prodotto) return await inserisci(prodotto, codice);
      if (sorgente === 'manuale') {
        // Scritto a mano e non è un codice: probabilmente è una descrizione, si cerca.
        setRicerca({ query: codice });
        return 'sconosciuto';
      }
      void naviga(percorsoAbbinaInSessione(codice, sessione.id));
      return 'sconosciuto';
    } catch (errore) {
      setAvviso({ tipo: 'errore', testo: messaggio(errore) });
      return 'sconosciuto';
    }
  };

  // Ritorno dal flusso di abbinamento: il barcode ora è noto, si prosegue con la quantità.
  const ritornoGestito = useRef<string>(undefined);
  useEffect(() => {
    const stato = posizione.state as Partial<StatoRitornoAbbinamento> | null;
    if (!stato?.abbinato || ritornoGestito.current === posizione.key) return;
    ritornoGestito.current = posizione.key;
    const { codiceProdotto, barcode } = stato.abbinato;
    void naviga(posizione.pathname, { replace: true, state: null });
    void db.prodotti.get(codiceProdotto).then(async (prodotto) => {
      if (!prodotto) return;
      try {
        await inserisci(prodotto, barcode);
      } catch (errore) {
        setAvviso({ tipo: 'errore', testo: messaggio(errore) });
      }
    });
  }, [posizione, naviga, inserisci]);

  const esci = () => {
    if (daCancellare) setDaCancellare(undefined);
    else if (foglio) setFoglio(undefined);
    else if (ricerca) setRicerca(undefined);
    else void naviga('/');
  };

  async function confermaQuantita(quantita: number) {
    if (!foglio) return;
    try {
      if (foglio.tipo === 'nuova') {
        await aggiungiRiga(db, sessione.id, {
          codiceProdotto: foglio.prodotto.codice,
          quantita,
          ...(foglio.barcodeLetto ? { barcodeLetto: foglio.barcodeLetto } : {}),
        });
      } else {
        await modificaQuantita(db, foglio.riga.id, quantita);
      }
      setAvviso(undefined);
    } catch (errore) {
      setAvviso({ tipo: 'errore', testo: messaggio(errore) });
    }
    setFoglio(undefined);
  }

  async function confermaCancellazione() {
    if (!daCancellare) return;
    try {
      await cancellaRiga(db, daCancellare.id);
    } catch (errore) {
      setAvviso({ tipo: 'errore', testo: messaggio(errore) });
    }
    setDaCancellare(undefined);
  }

  async function chiudi() {
    setChiusura(true);
    setErroreChiusura(undefined);
    try {
      await chiudiSessione(db, sessione.id);
      // La pagina passa da sola alla vista della sessione chiusa; l'invio parte in background.
      void avviaInvioCoda();
    } catch (errore) {
      setErroreChiusura(messaggio(errore));
      setChiusura(false);
    }
  }

  if (fase === 'riepilogo') {
    return (
      <Pagina
        titolo="Riepilogo"
        indietro={`/sessioni/${sessione.id}`}
        onIndietro={() => setFase('lavoro')}
      >
        {erroreChiusura && (
          <div className="-mx-4 -mt-4">
            <Avviso tipo="errore">{erroreChiusura}</Avviso>
          </div>
        )}
        <div>
          <p className="etichetta">{ETICHETTE_TIPO[sessione.tipo]}</p>
          <h2 className="text-xl break-words">{sessione.nome}</h2>
        </div>
        <Riepilogo
          tipo={sessione.tipo}
          riepilogo={calcolaRiepilogo(sessione.tipo, righe, prodotti)}
        />
        <button
          type="button"
          className="pulsante-primario"
          disabled={chiusura || righe.length === 0}
          onClick={() => void chiudi()}
        >
          <CheckCheck size={20} />
          {chiusura ? 'Chiusura…' : 'Chiudi e invia'}
        </button>
        {righe.length === 0 && (
          <p className="etichetta">La sessione è vuota: aggiungi almeno una riga per chiuderla.</p>
        )}
        <button
          type="button"
          className="pulsante-secondario"
          disabled={chiusura}
          onClick={() => setFase('lavoro')}
        >
          Torna alla sessione
        </button>
      </Pagina>
    );
  }

  const inOrdineInverso = [...righe].reverse();
  const ultima = inOrdineInverso[0];
  const prodottoUltima = ultima ? prodotti.get(ultima.codiceProdotto) : undefined;

  return (
    <Scanner
      incorporato
      titolo={sessione.nome}
      etichettaChiudi="Esci dalla sessione"
      segnapostoManuale="Scrivi il codice o cerca"
      avviso={avviso}
      onCodice={onCodice}
      onChiudi={esci}
    >
      <div className="mx-auto flex w-full max-w-xl flex-col gap-3 p-4">
        <div className="flex items-center gap-2">
          <p className="etichetta min-w-0 flex-1">
            {ETICHETTE_TIPO[sessione.tipo]} · {ETICHETTE_MODALITA[sessione.modalita]}
          </p>
          <button
            type="button"
            className="pulsante-secondario shrink-0"
            onClick={() => setRicerca({ query: '' })}
          >
            <Search size={20} />
            Cerca prodotto
          </button>
        </div>

        {ultima ? (
          <section
            aria-label="Ultima riga inserita"
            aria-live="polite"
            className="card border-2 border-giallo-scuro p-4"
          >
            <p className="etichetta">Ultima riga</p>
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-titolo text-lg font-bold break-all">{ultima.codiceProdotto}</p>
                <p>{prodottoUltima?.descrizione ?? 'Prodotto non più in catalogo'}</p>
              </div>
              <p className="shrink-0 text-4xl font-bold tabular-nums">
                {formattaNumero(ultima.quantita)}
              </p>
            </div>
            <p className="mt-2 flex flex-wrap gap-x-4 text-base">
              <span>
                Totale prodotto:{' '}
                <strong className="text-2xl tabular-nums">
                  {formattaNumero(totale(ultima.codiceProdotto))}
                </strong>
              </span>
              {inventario && prodottoUltima?.giacenza !== undefined && (
                <span className="etichetta self-end">
                  teorica {formattaNumero(prodottoUltima.giacenza)}
                </span>
              )}
            </p>
          </section>
        ) : (
          <p className="card p-4 etichetta">
            Nessuna riga: leggi un codice o cerca un prodotto per iniziare.
          </p>
        )}

        {righe.length > 0 && (
          <section aria-label="Righe della sessione" className="flex flex-col gap-2">
            <h2 className="text-base tracking-wide uppercase">
              Righe <span className="font-testo font-normal">({righe.length})</span>
            </h2>
            <ul className="card divide-y divide-grigio-bordo">
              {inOrdineInverso.map((riga) => (
                <li key={riga.id} className="flex items-center gap-2 py-2 pr-2 pl-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-titolo font-bold break-all">{riga.codiceProdotto}</p>
                    <p className="text-base">
                      {prodotti.get(riga.codiceProdotto)?.descrizione ?? '—'}
                    </p>
                  </div>
                  <p className="shrink-0 text-2xl font-bold tabular-nums">
                    {formattaNumero(riga.quantita)}
                  </p>
                  <button
                    type="button"
                    aria-label={`Modifica quantità di ${riga.codiceProdotto}`}
                    className="flex size-12 shrink-0 items-center justify-center rounded-full active:bg-grigio-sfondo"
                    onClick={() => setFoglio({ tipo: 'modifica', riga })}
                  >
                    <Pencil size={24} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Cancella riga di ${riga.codiceProdotto}`}
                    className="flex size-12 shrink-0 items-center justify-center rounded-full text-rosso active:bg-grigio-sfondo"
                    onClick={() => setDaCancellare(riga)}
                  >
                    <Trash2 size={24} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <button
          type="button"
          className="pulsante-primario"
          onClick={() => {
            setErroreChiusura(undefined);
            setFase('riepilogo');
          }}
        >
          <CheckCheck size={20} />
          Riepilogo e chiusura
        </button>
      </div>

      {foglio && (
        <FoglioQuantita
          key={foglio.tipo === 'nuova' ? foglio.prodotto.codice : foglio.riga.id}
          titolo={foglio.tipo === 'nuova' ? 'Quantità' : 'Modifica quantità'}
          codice={foglio.tipo === 'nuova' ? foglio.prodotto.codice : foglio.riga.codiceProdotto}
          descrizione={
            foglio.tipo === 'nuova'
              ? foglio.prodotto.descrizione
              : prodotti.get(foglio.riga.codiceProdotto)?.descrizione
          }
          giacenza={
            inventario
              ? foglio.tipo === 'nuova'
                ? foglio.prodotto.giacenza
                : prodotti.get(foglio.riga.codiceProdotto)?.giacenza
              : undefined
          }
          totaleAttuale={foglio.tipo === 'nuova' ? totale(foglio.prodotto.codice) : undefined}
          valoreIniziale={foglio.tipo === 'modifica' ? testoQuantita(foglio.riga.quantita) : ''}
          etichettaConferma={foglio.tipo === 'nuova' ? 'Aggiungi' : 'Salva'}
          onConferma={(quantita) => void confermaQuantita(quantita)}
          onAnnulla={() => setFoglio(undefined)}
        />
      )}

      {ricerca && (
        <RicercaProdotto
          queryIniziale={ricerca.query}
          onChiudi={() => setRicerca(undefined)}
          onScegli={(prodotto) => {
            setRicerca(undefined);
            void inserisci(prodotto).catch((errore: unknown) =>
              setAvviso({ tipo: 'errore', testo: messaggio(errore) }),
            );
          }}
        />
      )}

      {daCancellare && (
        <Dialogo
          titolo="Cancellare la riga?"
          etichettaConferma="Cancella riga"
          distruttivo
          onConferma={() => void confermaCancellazione()}
          onAnnulla={() => setDaCancellare(undefined)}
        >
          <p>
            <strong className="font-titolo break-all">{daCancellare.codiceProdotto}</strong>,
            quantità{' '}
            <strong className="tabular-nums">{formattaNumero(daCancellare.quantita)}</strong>.
          </p>
        </Dialogo>
      )}
    </Scanner>
  );
}

function SessioneChiusa({ sessione, righe }: { sessione: SessioneLocale; righe: Riga[] }) {
  const prodotti = useProdottiRighe(righe);
  const { impostazioni } = useImpostazioni();
  const { inCorso } = useStatoCoda();
  const voceCoda = useLiveQuery(
    async () =>
      (await db.codaUpload
        .where('tipo')
        .equals('sessione')
        .filter((voce) => voce.riferimento === sessione.id)
        .first()) ?? null,
    [sessione.id],
  );
  const [messaggioAzione, setMessaggioAzione] = useState<Messaggio>();
  const [confermaRiapri, setConfermaRiapri] = useState(false);
  const [condivisione, setCondivisione] = useState(false);
  const riepilogo = useMemo(
    () => calcolaRiepilogo(sessione.tipo, righe, prodotti),
    [sessione.tipo, righe, prodotti],
  );

  async function condividi() {
    if (!impostazioni) return;
    setCondivisione(true);
    setMessaggioAzione(undefined);
    try {
      const esito = await condividiFileTerminale(sessione, righe, impostazioni);
      if (esito === 'scaricato') {
        setMessaggioAzione({ tipo: 'conferma', testo: 'File scaricato sul telefono.' });
      }
    } catch (errore) {
      setMessaggioAzione({ tipo: 'errore', testo: messaggio(errore) });
    } finally {
      setCondivisione(false);
    }
  }

  async function riapri() {
    try {
      await riapriSessione(db, sessione.id);
    } catch (errore) {
      setMessaggioAzione({ tipo: 'errore', testo: messaggio(errore) });
      setConfermaRiapri(false);
    }
  }

  return (
    <Pagina titolo="Sessione" indietro="/">
      {voceCoda && (
        <div className="-mx-4 -mt-4">
          <Avviso tipo="avviso">
            In attesa di invio al bridge
            {voceCoda.ultimoErrore && (
              <span className="block font-normal">{voceCoda.ultimoErrore}</span>
            )}
          </Avviso>
        </div>
      )}
      {messaggioAzione && (
        <div className={`-mx-4 ${voceCoda ? '' : '-mt-4'}`}>
          <Avviso tipo={messaggioAzione.tipo}>{messaggioAzione.testo}</Avviso>
        </div>
      )}

      <section className="card flex flex-col gap-1 p-4">
        <div className="flex items-start gap-2">
          <p className="etichetta min-w-0 flex-1">{ETICHETTE_TIPO[sessione.tipo]}</p>
          <ChipStato stato={sessione.stato} />
        </div>
        <h2 className="text-xl break-words">{sessione.nome}</h2>
        <p className="etichetta">
          Creata {formattaDataOra(sessione.creataIl)} · chiusa{' '}
          {formattaDataOra(sessione.chiusaIl, '—')}
        </p>
        {sessione.dispositivo && <p className="etichetta">Dispositivo: {sessione.dispositivo}</p>}
        {sessione.note && <p className="mt-1 whitespace-pre-wrap">{sessione.note}</p>}
        {sessione.stato === 'chiusa' && voceCoda === null && (
          <p className="mt-1 font-semibold text-verde">Inviata al bridge.</p>
        )}
      </section>

      {voceCoda && (
        <button
          type="button"
          className="pulsante-secondario"
          disabled={inCorso}
          onClick={() => void avviaInvioCoda()}
        >
          <Send size={20} />
          {inCorso ? 'Invio in corso…' : 'Invia ora'}
        </button>
      )}
      <button
        type="button"
        className="pulsante-primario"
        disabled={condivisione || !impostazioni}
        onClick={() => void condividi()}
      >
        <Share2 size={20} />
        Condividi file
      </button>
      <p className="etichetta -mt-2">
        Genera qui il file del terminalino: serve quando il bridge non è raggiungibile.
      </p>
      {sessione.stato === 'chiusa' && (
        <button
          type="button"
          className="pulsante-secondario"
          onClick={() => setConfermaRiapri(true)}
        >
          <RotateCcw size={20} />
          Riapri sessione
        </button>
      )}

      <Riepilogo tipo={sessione.tipo} riepilogo={riepilogo} />

      {confermaRiapri && (
        <Dialogo
          titolo="Riaprire la sessione?"
          etichettaConferma="Riapri"
          onConferma={() => void riapri()}
          onAnnulla={() => setConfermaRiapri(false)}
        >
          <p>
            Potrai aggiungere e modificare righe. Alla nuova chiusura la sessione sarà rispedita al
            bridge e sostituirà quella inviata prima: se l’avevi già esportata, rifai l’export.
          </p>
        </Dialogo>
      )}
    </Pagina>
  );
}
