import { IMPOSTAZIONI_DEFAULT } from '@terminalinobru/core';
import { Flashlight, FlashlightOff, SwitchCamera, X } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Avviso } from '../componenti/Avviso.js';
import { useImpostazioni } from '../hooks/useImpostazioni.js';
import { creaAntiRimbalzo } from './antiRimbalzo.js';
import { preparaAudio, segnalaEsito } from './feedback.js';
import { ascoltaLettoreTastiera } from './lettoreTastiera.js';
import type { EsitoLettura, SorgenteLettura } from './tipi.js';
import { useFotocamera } from './useFotocamera.js';

export type { EsitoLettura, SorgenteLettura } from './tipi.js';

export type ProprietaScanner = {
  /**
   * Riceve ogni codice letto. L'esito restituito sceglie il feedback: `trovato` (anche se non
   * restituisce nulla), `sconosciuto` o `ignorato`. Finché la promessa non si risolve le altre
   * letture vengono scartate.
   */
  onCodice: (
    codice: string,
    sorgente: SorgenteLettura,
  ) => EsitoLettura | void | Promise<EsitoLettura | void>;
  onChiudi: () => void;
  titolo?: string;
  /** Messaggio in fondo allo scanner, per esempio l'errore dell'ultima lettura. */
  avviso?: { tipo: 'conferma' | 'errore' | 'avviso'; testo: string } | undefined;
  /** Segnaposto del campo di digitazione manuale. */
  segnapostoManuale?: string;
  /** Contenuto aggiuntivo nel pannello inferiore (la pagina di prova ci mette l'elenco letture). */
  children?: ReactNode;
  /**
   * Modalità incorporata, per la schermata sessione: la fotocamera occupa solo la parte alta e
   * sotto il campo manuale il contenuto (`children`) scorre su sfondo chiaro, a tutta altezza.
   */
  incorporato?: boolean;
  /** Etichetta accessibile del pulsante di chiusura. */
  etichettaChiudi?: string;
  /**
   * Sospende l'analisi dei fotogrammi (la fotocamera resta accesa) mentre chi usa lo scanner ha
   * una finestra aperta e scarterebbe comunque le letture: il processore resta all'interfaccia.
   */
  inPausa?: boolean;
};

/**
 * Scanner a schermo intero su nero con cornice guida gialla (docs/STILE.md sezioni 3 e 6).
 * Finché è montato ascolta tre sorgenti: fotocamera, lettore in modalità tastiera e campo manuale.
 */
export function Scanner({
  onCodice,
  onChiudi,
  titolo = 'Scansiona',
  avviso,
  segnapostoManuale = 'Scrivi il codice',
  children,
  incorporato = false,
  etichettaChiudi = 'Chiudi scanner',
  inPausa = false,
}: ProprietaScanner) {
  const video = useRef<HTMLVideoElement>(null);
  const { impostazioni } = useImpostazioni();
  const [manuale, setManuale] = useState('');
  const idManuale = useId();
  const occupato = useRef(false);
  const antiRimbalzo = useRef(creaAntiRimbalzo());

  const preferenze = useRef(IMPOSTAZIONI_DEFAULT);
  if (impostazioni) preferenze.current = impostazioni;
  const ultimoOnCodice = useRef(onCodice);
  ultimoOnCodice.current = onCodice;

  const emetti = useCallback(async (codice: string, sorgente: SorgenteLettura) => {
    const pulito = codice.trim();
    if (pulito === '' || occupato.current) return;
    occupato.current = true;
    try {
      const esito = (await ultimoOnCodice.current(pulito, sorgente)) ?? 'trovato';
      segnalaEsito(esito, preferenze.current);
    } catch (errore) {
      console.error('Gestione del codice letto non riuscita', errore);
      segnalaEsito('sconosciuto', preferenze.current);
    } finally {
      occupato.current = false;
    }
  }, []);

  const fotocamera = useFotocamera(
    video,
    (codice) => {
      if (antiRimbalzo.current(codice, performance.now())) void emetti(codice, 'fotocamera');
    },
    { inPausa },
  );

  // Lettore Bluetooth o USB in modalità tastiera, attivo finché lo scanner è aperto.
  useEffect(
    () => ascoltaLettoreTastiera(document, (codice) => void emetti(codice, 'lettore')),
    [emetti],
  );

  useEffect(() => {
    preparaAudio();
    // Il campo di ricerca sotto lo scanner non deve tenere il fuoco né far scorrere la pagina.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  useEffect(() => {
    const alTasto = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') onChiudi();
    };
    document.addEventListener('keydown', alTasto);
    return () => document.removeEventListener('keydown', alTasto);
  }, [onChiudi]);

  const { stato, torcia } = fotocamera;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={titolo}
      className="fixed inset-0 z-50 flex flex-col bg-nero text-bianco"
    >
      <div
        className={`relative flex flex-col overflow-hidden ${
          incorporato ? 'h-[38dvh] shrink-0' : 'min-h-0 flex-1'
        }`}
      >
        <video
          ref={video}
          muted
          playsInline
          aria-hidden
          className="absolute inset-0 size-full object-cover"
        />

        <header className="relative z-10 flex shrink-0 items-center gap-1 bg-nero/50 px-2 pt-[env(safe-area-inset-top)]">
          <div className="flex h-14 min-w-0 flex-1 items-center gap-1">
            <h1 className="min-w-0 flex-1 truncate px-2 text-lg tracking-wide uppercase">
              {titolo}
            </h1>
            {torcia.disponibile && (
              <button
                type="button"
                className="flex size-12 items-center justify-center rounded-full active:bg-grafite"
                aria-label={torcia.accesa ? 'Spegni torcia' : 'Accendi torcia'}
                aria-pressed={torcia.accesa}
                onClick={() => void fotocamera.alternaTorcia()}
              >
                {torcia.accesa ? <FlashlightOff size={28} /> : <Flashlight size={28} />}
              </button>
            )}
            {fotocamera.fotocamere.length > 1 && (
              <button
                type="button"
                className="flex size-12 items-center justify-center rounded-full active:bg-grafite"
                aria-label="Cambia fotocamera"
                onClick={fotocamera.cambiaFotocamera}
              >
                <SwitchCamera size={28} />
              </button>
            )}
            <button
              type="button"
              className="flex size-12 items-center justify-center rounded-full active:bg-grafite"
              aria-label={etichettaChiudi}
              onClick={onChiudi}
            >
              <X size={28} />
            </button>
          </div>
        </header>

        {/* La cornice scurisce il video attorno a sé con un contorno enorme, tagliato a quest'area. */}
        <div
          className={`relative z-10 flex min-h-0 flex-1 items-center justify-center overflow-hidden ${
            incorporato ? 'p-3' : 'p-6'
          }`}
        >
          {stato.fase === 'problema' ? (
            <div className="flex max-w-sm flex-col items-center gap-4 text-center" role="alert">
              <p className="text-base font-semibold">{stato.problema.messaggio}</p>
              {stato.problema.tipo !== 'non-supportata' && (
                <button
                  type="button"
                  className="pulsante-primario w-full"
                  onClick={fotocamera.riprova}
                >
                  Riprova
                </button>
              )}
              <p className="text-sm">
                Puoi sempre usare il lettore o scrivere il codice qui sotto.
              </p>
            </div>
          ) : (
            <div
              aria-hidden
              className="aspect-[3/2] max-h-full w-full max-w-sm rounded-xl border-4 border-giallo outline-[100vmax] outline-nero/50 outline-solid"
            />
          )}
          {stato.fase === 'avvio' && (
            <p className="absolute text-base font-semibold" role="status">
              Avvio fotocamera…
            </p>
          )}
        </div>
      </div>

      <div
        className={`relative z-10 flex shrink-0 flex-col gap-2 bg-nero ${
          incorporato ? '' : 'pb-[env(safe-area-inset-bottom)]'
        }`}
      >
        {avviso && <Avviso tipo={avviso.tipo}>{avviso.testo}</Avviso>}
        <form
          className="flex gap-2 px-4 pt-2"
          onSubmit={(evento) => {
            evento.preventDefault();
            const codice = manuale.trim();
            if (codice === '') return;
            setManuale('');
            void emetti(codice, 'manuale');
          }}
        >
          <label htmlFor={idManuale} className="sr-only">
            Codice da cercare
          </label>
          <input
            id={idManuale}
            className="campo"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="search"
            placeholder={segnapostoManuale}
            value={manuale}
            onChange={(evento) => setManuale(evento.target.value)}
          />
          <button type="submit" className="pulsante-primario shrink-0">
            Cerca
          </button>
        </form>
        <p className="px-4 pb-3 text-sm">
          {stato.fase === 'attiva'
            ? `Inquadra il codice nella cornice${stato.origine === 'polyfill' ? ' (lettura software)' : ''}. Lettore Bluetooth pronto.`
            : 'Lettore Bluetooth pronto.'}
        </p>
        {!incorporato && children}
      </div>
      {incorporato && (
        <div className="min-h-0 flex-1 overflow-y-auto bg-grigio-sfondo pb-[env(safe-area-inset-bottom)] text-grafite">
          {children}
        </div>
      )}
    </div>
  );
}
