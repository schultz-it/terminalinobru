import { rilevaInputLettore, type EventoTasto, type OpzioniLettore } from '@terminalinobru/core';

/** Eventi tenuti in memoria al massimo: un codice lungo (QR di setup) sta ben sotto. */
const MASSIMO_EVENTI = 512;

export type OpzioniAscoltoLettore = OpzioniLettore & {
  /** Orologio in millisecondi, sostituibile nei test. Default `performance.now`. */
  adesso?: () => number;
};

/**
 * Toglie dal campo di testo i caratteri che il lettore ha scritto prima che la raffica fosse
 * riconosciuta, così il campo resta com'era. Usa il setter nativo e un evento `input` perché
 * anche i campi controllati da React si aggiornino.
 */
export function rimuoviDalCampo(bersaglio: EventTarget | null, codice: string): void {
  const vista = (bersaglio as Node | null)?.ownerDocument?.defaultView;
  if (!vista) return;
  const campo =
    bersaglio instanceof vista.HTMLInputElement || bersaglio instanceof vista.HTMLTextAreaElement
      ? bersaglio
      : null;
  if (!campo) return;
  const valore = campo.value;
  let fine: number;
  try {
    fine = campo.selectionEnd ?? valore.length;
  } catch {
    // Alcuni tipi di input (number, email) non espongono la selezione.
    fine = valore.length;
  }
  if (!valore.slice(0, fine).endsWith(codice)) return;
  const nuovo = valore.slice(0, fine - codice.length) + valore.slice(fine);
  const prototipo =
    campo instanceof vista.HTMLInputElement
      ? vista.HTMLInputElement.prototype
      : vista.HTMLTextAreaElement.prototype;
  Object.getOwnPropertyDescriptor(prototipo, 'value')?.set?.call(campo, nuovo);
  try {
    campo.setSelectionRange(fine - codice.length, fine - codice.length);
  } catch {
    // Selezione non supportata dal tipo di campo: nessun problema.
  }
  campo.dispatchEvent(new vista.Event('input', { bubbles: true }));
}

/**
 * Ascolta a livello di documento un lettore barcode in modalità tastiera (Bluetooth o USB).
 * I tasti passano da `rilevaInputLettore` di core: solo una raffica più veloce della digitazione
 * umana e terminata da Invio diventa un codice. La distinzione è sulla velocità, non sul fuoco:
 * chi scrive a mano in un campo non viene disturbato; se invece il lettore spara dentro un campo,
 * l'Invio viene fermato e i caratteri della raffica vengono tolti dal campo.
 * Restituisce la funzione che smette di ascoltare.
 */
export function ascoltaLettoreTastiera(
  documento: Document,
  onCodice: (codice: string) => void,
  opzioni: OpzioniAscoltoLettore = {},
): () => void {
  const { adesso = () => performance.now(), ...opzioniLettore } = opzioni;
  let eventi: EventoTasto[] = [];

  const gestisci = (evento: KeyboardEvent) => {
    // Scorciatoie, tasti tenuti premuti e composizione IME non sono mai un lettore.
    if (evento.ctrlKey || evento.metaKey || evento.repeat || evento.isComposing) {
      eventi = [];
      return;
    }
    eventi.push({ tasto: evento.key, istante: adesso() });
    if (evento.key !== 'Enter') {
      if (eventi.length > MASSIMO_EVENTI) eventi = eventi.slice(-MASSIMO_EVENTI);
      return;
    }
    const codice = rilevaInputLettore(eventi, opzioniLettore);
    eventi = [];
    if (codice === null) return;
    evento.preventDefault();
    evento.stopPropagation();
    rimuoviDalCampo(evento.target, codice);
    onCodice(codice);
  };

  // Fase di cattura: l'Invio del lettore va fermato prima che arrivi ai form e a React.
  documento.addEventListener('keydown', gestisci, true);
  return () => documento.removeEventListener('keydown', gestisci, true);
}
