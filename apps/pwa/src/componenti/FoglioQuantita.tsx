import { Delete } from 'lucide-react';
import { useEffect, useId, useRef, useState, type PointerEvent } from 'react';
import { formattaNumero } from '../formato.js';
import { leggiQuantita } from '../sessioni/quantita.js';

const TASTI = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'cancella'] as const;

/** I tasti a schermo non devono togliere il fuoco al campo: così Invio da tastiera funziona sempre. */
function tieniFuoco(evento: PointerEvent) {
  evento.preventDefault();
}

/**
 * Foglio dal basso con il tastierino numerico per la quantità (docs/STILE.md sezione 3).
 * Il campo tiene sempre il fuoco senza aprire la tastiera del telefono (`inputMode="none"`):
 * si digita con i tasti grandi o con una tastiera fisica, e Invio conferma.
 */
export function FoglioQuantita({
  titolo,
  codice,
  descrizione,
  giacenza,
  totaleAttuale,
  valoreIniziale = '',
  etichettaConferma = 'Conferma',
  onConferma,
  onAnnulla,
}: {
  titolo: string;
  codice: string;
  descrizione?: string | undefined;
  /** Giacenza teorica, mostrata solo se passata (inventario). */
  giacenza?: number | undefined;
  /** Quantità già presente nella sessione per questo prodotto. */
  totaleAttuale?: number | undefined;
  valoreIniziale?: string;
  etichettaConferma?: string;
  onConferma: (quantita: number) => void;
  onAnnulla: () => void;
}) {
  const [testo, setTesto] = useState(valoreIniziale);
  const [errore, setErrore] = useState<string>();
  const [avvisoZero, setAvvisoZero] = useState(false);
  const campo = useRef<HTMLInputElement>(null);
  const montato = useRef(true);
  const idTitolo = useId();
  const idCampo = useId();

  useEffect(() => {
    montato.current = true;
    campo.current?.focus();
    return () => {
      montato.current = false;
    };
  }, []);

  function cambia(nuovo: string) {
    setTesto(nuovo);
    setErrore(undefined);
    setAvvisoZero(false);
  }

  function premi(tasto: (typeof TASTI)[number]) {
    if (tasto === 'cancella') cambia(testo.slice(0, -1));
    else if (tasto === ',' && /[.,]/.test(testo)) return;
    else cambia(testo + tasto);
  }

  function conferma() {
    const lettura = leggiQuantita(testo);
    if (lettura.tipo === 'errore') {
      setErrore(lettura.messaggio);
      return;
    }
    if (lettura.tipo === 'zero') {
      // Lo zero serve (inventario di un prodotto esaurito) ma va confermato due volte.
      if (!avvisoZero) {
        setAvvisoZero(true);
        return;
      }
      onConferma(0);
      return;
    }
    onConferma(lettura.valore);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-nero/60">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitolo}
        className="flex max-h-full w-full max-w-xl flex-col gap-3 overflow-y-auto rounded-t-xl bg-bianco p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-grafite"
      >
        <div>
          <h2 id={idTitolo} className="etichetta font-testo font-normal uppercase">
            {titolo}
          </h2>
          <p className="font-titolo text-lg font-bold break-all">{codice}</p>
          {descrizione && <p>{descrizione}</p>}
          <p className="etichetta mt-1 flex flex-wrap gap-x-4">
            {giacenza !== undefined && (
              <span>
                Giacenza teorica:{' '}
                <strong className="text-grafite tabular-nums">{formattaNumero(giacenza)}</strong>
              </span>
            )}
            {totaleAttuale !== undefined && totaleAttuale > 0 && (
              <span>
                Già nella sessione:{' '}
                <strong className="text-grafite tabular-nums">
                  {formattaNumero(totaleAttuale)}
                </strong>
              </span>
            )}
          </p>
        </div>

        <label htmlFor={idCampo} className="sr-only">
          Quantità
        </label>
        <input
          ref={campo}
          id={idCampo}
          inputMode="none"
          autoComplete="off"
          enterKeyHint="done"
          placeholder="0"
          aria-invalid={errore !== undefined}
          className="min-h-20 w-full rounded-[10px] border-2 border-giallo-scuro bg-bianco px-4 text-right text-5xl font-bold tabular-nums outline-none"
          value={testo}
          onChange={(evento) => cambia(evento.target.value)}
          onBlur={() => {
            // Il fuoco torna sul campo: il foglio si usa senza toccare lo schermo.
            requestAnimationFrame(() => {
              if (montato.current) campo.current?.focus();
            });
          }}
          onKeyDown={(evento) => {
            if (evento.key === 'Enter') {
              evento.preventDefault();
              conferma();
            }
          }}
        />
        {errore && (
          <p role="alert" className="font-semibold text-rosso">
            {errore}
          </p>
        )}
        {avvisoZero && (
          <p role="alert" className="rounded-[10px] bg-giallo-chiaro p-3 font-semibold">
            Quantità zero: premi di nuovo Conferma (o Invio) per registrarla.
          </p>
        )}

        <div className="grid grid-cols-3 gap-2">
          {TASTI.map((tasto) => (
            <button
              key={tasto}
              type="button"
              aria-label={tasto === 'cancella' ? 'Cancella una cifra' : tasto}
              className="flex min-h-14 items-center justify-center rounded-[10px] border border-grigio-bordo bg-bianco text-4xl font-semibold tabular-nums active:bg-grigio-sfondo"
              onPointerDown={tieniFuoco}
              onClick={() => premi(tasto)}
            >
              {tasto === 'cancella' ? <Delete size={32} /> : tasto}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="pulsante-primario min-h-14 w-full text-lg"
          onPointerDown={tieniFuoco}
          onClick={conferma}
        >
          {etichettaConferma}
        </button>
        <button
          type="button"
          className="pulsante-secondario"
          onPointerDown={tieniFuoco}
          onClick={onAnnulla}
        >
          Annulla
        </button>
      </div>
    </div>
  );
}
