/** Lettere ammesse nella stringa formato (docs/PROTOCOLLI-DANEA.md sezione 1.2). */
export const LETTERE_AMMESSE = ['A', 'Q', 'q', 'L', 'S', 'X'] as const;

/** Lettera di un campo della stringa formato. */
export type LetteraFormato = (typeof LETTERE_AMMESSE)[number];

/** Lettera ammessa nel formato a campi delimitati: la parte decimale `q` esiste solo nel fisso. */
export type LetteraDelimitata = Exclude<LetteraFormato, 'q'>;

/** Campo del formato a spaziatura fissa: lettera e numero di caratteri. */
export type CampoFisso = { lettera: LetteraFormato; lunghezza: number };

/** Formato a campi delimitati, es. `A,Q`. */
export type FormatoDelimitato = {
  ok: true;
  tipo: 'delimitato';
  separatore: string;
  campi: LetteraDelimitata[];
};

/** Formato a spaziatura fissa, es. `AAAAQQQqq`. */
export type FormatoFisso = {
  ok: true;
  tipo: 'fisso';
  campi: CampoFisso[];
};

/** Stringa formato non valida, con la spiegazione da mostrare in app. */
export type FormatoNonValido = { ok: false; errore: string };

/** Esito dell'analisi di una stringa formato. */
export type RisultatoStringaFormato = FormatoDelimitato | FormatoFisso | FormatoNonValido;

/** Carattere con cui la UI di Easyfatt indica la tabulazione come separatore. */
const SEGNO_TABULAZIONE = '§';

function eLetteraAmmessa(carattere: string): carattere is LetteraFormato {
  return (LETTERE_AMMESSE as readonly string[]).includes(carattere);
}

function eLettera(carattere: string): boolean {
  return /\p{L}/u.test(carattere);
}

function errore(messaggio: string): FormatoNonValido {
  return { ok: false, errore: messaggio };
}

/** Controlla la presenza dei campi obbligatori e l'assenza di duplicati (la X può ripetersi). */
function verificaCampi(lettere: readonly LetteraFormato[]): FormatoNonValido | undefined {
  if (!lettere.includes('A')) {
    return errore('La stringa formato deve contenere il campo A (codice prodotto o barcode).');
  }
  if (!lettere.includes('Q')) {
    return errore('La stringa formato deve contenere il campo Q (quantità).');
  }
  const viste = new Set<LetteraFormato>();
  for (const lettera of lettere) {
    if (lettera === 'X') continue;
    if (viste.has(lettera)) {
      return errore(`Il campo ${lettera} è ripetuto: ogni campo può comparire una sola volta.`);
    }
    viste.add(lettera);
  }
  return undefined;
}

/** Analizza una stringa formato a campi delimitati, con separatore già individuato. */
function analizzaDelimitato(stringa: string, separatore: string): RisultatoStringaFormato {
  const pezzi = stringa.split(separatore);
  const campi: LetteraDelimitata[] = [];
  for (const pezzo of pezzi) {
    if (pezzo === '') {
      return errore(
        `La stringa formato contiene un campo vuoto: togli il separatore "${separatore}" di troppo.`,
      );
    }
    if (pezzo.length > 1) {
      return errore(
        `Nel formato a campi delimitati ogni campo è una sola lettera, trovato "${pezzo}".`,
      );
    }
    if (!eLetteraAmmessa(pezzo)) {
      return errore(
        `Carattere non ammesso "${pezzo}" nella stringa formato: usa solo ${LETTERE_AMMESSE.join(' ')}.`,
      );
    }
    if (pezzo === 'q') {
      return errore(
        'Il campo q (parte decimale) è ammesso solo nel formato a spaziatura fissa: nei campi delimitati la quantità completa sta in Q.',
      );
    }
    campi.push(pezzo);
  }
  const problema = verificaCampi(campi);
  if (problema) return problema;
  return { ok: true, tipo: 'delimitato', separatore, campi };
}

/** Analizza una stringa formato a spaziatura fissa, raggruppando le lettere uguali adiacenti. */
function analizzaFisso(stringa: string): RisultatoStringaFormato {
  const campi: CampoFisso[] = [];
  for (const carattere of stringa) {
    if (!eLetteraAmmessa(carattere)) {
      return errore(
        `Carattere non ammesso "${carattere}" nella stringa formato: usa solo ${LETTERE_AMMESSE.join(' ')}.`,
      );
    }
    const ultimo = campi[campi.length - 1];
    if (ultimo !== undefined && ultimo.lettera === carattere) {
      ultimo.lunghezza += 1;
    } else {
      campi.push({ lettera: carattere, lunghezza: 1 });
    }
  }
  const problema = verificaCampi(campi.map((c) => c.lettera));
  if (problema) return problema;
  return { ok: true, tipo: 'fisso', campi };
}

/**
 * Valida e interpreta la stringa formato del terminalino, oppure spiega in italiano cos'è sbagliato.
 * Il carattere `§` è inteso come tabulazione, come nella UI di Easyfatt.
 */
export function analizzaStringaFormato(stringa: string): RisultatoStringaFormato {
  if (stringa === '') return errore('La stringa formato è vuota.');
  if (stringa.trim() !== stringa) {
    return errore('La stringa formato non può iniziare o finire con uno spazio.');
  }
  const normalizzata = stringa.split(SEGNO_TABULAZIONE).join('\t');
  const separatori = new Set<string>();
  for (const carattere of normalizzata) {
    if (!eLetteraAmmessa(carattere) && !eLettera(carattere)) separatori.add(carattere);
  }
  if (separatori.size > 1) {
    const elenco = [...separatori].map((s) => `"${s === '\t' ? '\\t' : s}"`).join(' ');
    return errore(`La stringa formato usa più separatori diversi (${elenco}): usane uno solo.`);
  }
  const separatore = [...separatori][0];
  if (separatore === undefined) return analizzaFisso(normalizzata);
  return analizzaDelimitato(normalizzata, separatore);
}
