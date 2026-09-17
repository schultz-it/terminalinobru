import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import {
  descriviErroreFotocamera,
  fermaStream,
  fotocameraSuccessiva,
  leggiFotocameraScelta,
  salvaFotocameraScelta,
  vincoliVideo,
  type ProblemaFotocamera,
} from './fotocamera.js';
import { ottieniRilevatore, type Rilevatore } from './rilevatore.js';

/** Pausa minima fra due analisi di fotogramma. Il nativo impiega poche decine di ms per analisi. */
const PAUSA_ANALISI_MS = 40;

/** Con l'analisi sospesa si ricontrolla solo ogni tanto se riprendere. */
const PAUSA_SOSPESA_MS = 250;

export type StatoFotocamera =
  | { fase: 'avvio' }
  | { fase: 'attiva'; origine: Rilevatore['origine'] }
  | { fase: 'problema'; problema: ProblemaFotocamera };

type CapacitaTorcia = MediaTrackCapabilities & { torch?: boolean };

/**
 * Gestisce fotocamera e analisi dei fotogrammi. La fotocamera è accesa solo mentre il componente
 * è montato e la pagina è visibile: con la pagina in background o smontando il componente tutte le
 * tracce vengono fermate, e si riaccende al ritorno.
 */
export function useFotocamera(
  video: RefObject<HTMLVideoElement | null>,
  onRilevato: (codice: string) => void,
  opzioni: { inPausa?: boolean } = {},
) {
  const [stato, setStato] = useState<StatoFotocamera>({ fase: 'avvio' });
  const [tentativo, setTentativo] = useState(0);
  const [idDispositivo, setIdDispositivo] = useState<string | undefined>(leggiFotocameraScelta);
  const [fotocamere, setFotocamere] = useState<string[]>([]);
  const [torcia, setTorcia] = useState<{ disponibile: boolean; accesa: boolean }>({
    disponibile: false,
    accesa: false,
  });
  const traccia = useRef<MediaStreamTrack | undefined>(undefined);
  const ultimoOnRilevato = useRef(onRilevato);
  ultimoOnRilevato.current = onRilevato;
  const inPausa = useRef(opzioni.inPausa ?? false);
  inPausa.current = opzioni.inPausa ?? false;

  useEffect(() => {
    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Ogni avvio ha il suo numero: un ciclo di analisi di un avvio precedente si ferma da solo.
    let generazione = 0;
    let smontato = false;

    const ferma = () => {
      generazione += 1;
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      fermaStream(stream);
      stream = undefined;
      traccia.current = undefined;
      const elemento = video.current;
      if (elemento) elemento.srcObject = null;
      setTorcia({ disponibile: false, accesa: false });
    };

    const avvia = async () => {
      ferma();
      const mia = generazione;
      const attuale = () => !smontato && mia === generazione;
      setStato({ fase: 'avvio' });
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new TypeError('mediaDevices non disponibile');
        }
        const nuovo = await navigator.mediaDevices.getUserMedia(vincoliVideo(idDispositivo));
        if (!attuale()) {
          fermaStream(nuovo);
          return;
        }
        stream = nuovo;
        const [videoTraccia] = nuovo.getVideoTracks();
        traccia.current = videoTraccia;
        const capacita = videoTraccia?.getCapabilities?.() as CapacitaTorcia | undefined;
        setTorcia({ disponibile: capacita?.torch === true, accesa: false });

        const elemento = video.current;
        if (!elemento) return;
        elemento.srcObject = nuovo;
        await elemento.play().catch(() => undefined);

        // Solo dopo il permesso l'elenco dei dispositivi è completo.
        void navigator.mediaDevices
          .enumerateDevices()
          .then((dispositivi) => {
            if (!attuale()) return;
            setFotocamere(
              dispositivi
                .filter((d) => d.kind === 'videoinput' && d.deviceId)
                .map((d) => d.deviceId),
            );
          })
          .catch(() => undefined);

        const rilevatore = await ottieniRilevatore();
        if (!attuale()) return;
        setStato({ fase: 'attiva', origine: rilevatore.origine });

        const analizza = async () => {
          if (!attuale()) return;
          let pausa = PAUSA_ANALISI_MS;
          const sorgente = video.current;
          if (inPausa.current) {
            pausa = PAUSA_SOSPESA_MS;
          } else if (sorgente && sorgente.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            const inizio = performance.now();
            try {
              const trovati = await rilevatore.detect(sorgente);
              const primo = trovati.find((b) => b.rawValue !== '');
              if (primo && attuale()) ultimoOnRilevato.current(primo.rawValue);
            } catch {
              // Un fotogramma non analizzabile non ferma lo scanner.
            }
            // Mai più di metà del tempo in analisi: su un telefono lento, o con il lettore
            // software, il resto deve restare all'interfaccia.
            pausa = Math.max(PAUSA_ANALISI_MS, performance.now() - inizio);
          }
          if (attuale()) timer = setTimeout(() => void analizza(), pausa);
        };
        void analizza();
      } catch (errore) {
        if (!attuale()) return;
        const problema = descriviErroreFotocamera(errore);
        // Una fotocamera salvata che non esiste più: si torna a quella posteriore predefinita.
        if (idDispositivo && problema.tipo === 'assente') {
          salvaFotocameraScelta(undefined);
          setIdDispositivo(undefined);
          return;
        }
        setStato({ fase: 'problema', problema });
      }
    };

    const alCambioVisibilita = () => {
      if (document.visibilityState === 'hidden') ferma();
      else void avvia();
    };

    if (document.visibilityState !== 'hidden') void avvia();
    document.addEventListener('visibilitychange', alCambioVisibilita);
    window.addEventListener('pagehide', ferma);
    return () => {
      smontato = true;
      document.removeEventListener('visibilitychange', alCambioVisibilita);
      window.removeEventListener('pagehide', ferma);
      ferma();
    };
  }, [video, tentativo, idDispositivo]);

  const riprova = useCallback(() => setTentativo((n) => n + 1), []);

  const cambiaFotocamera = useCallback(() => {
    const prossima = fotocameraSuccessiva(
      fotocamere,
      idDispositivo ?? traccia.current?.getSettings().deviceId,
    );
    salvaFotocameraScelta(prossima);
    setIdDispositivo(prossima);
  }, [fotocamere, idDispositivo]);

  const alternaTorcia = useCallback(async () => {
    const attuale = traccia.current;
    if (!attuale) return;
    const accesa = !torcia.accesa;
    try {
      await attuale.applyConstraints({ advanced: [{ torch: accesa } as MediaTrackConstraintSet] });
      setTorcia({ disponibile: true, accesa });
    } catch {
      setTorcia({ disponibile: false, accesa: false });
    }
  }, [torcia.accesa]);

  return { stato, riprova, fotocamere, cambiaFotocamera, torcia, alternaTorcia };
}
