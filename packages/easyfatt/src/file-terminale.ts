import {
  analizzaStringaFormato,
  type CampoFisso,
  type LetteraDelimitata,
  type RisultatoStringaFormato,
} from './stringa-formato.js';

/** Riga da scrivere nel file del terminalino. */
export type RigaTerminale = {
  codice: string;
  quantita: number;
  lotto?: string;
  scadenza?: string | Date;
};

/** Opzioni di generazione del file del terminalino. */
export type OpzioniFileTerminale = {
  /** Stringa formato configurata in Easyfatt, es. `A,Q` o `AAAAQQQqq`. */
  stringaFormato: string;
  /** Separatore dei decimali della quantità. Default `.`. */
  separatoreDecimale?: '.' | ',';
  /** Fine riga. Default `\r\n`. */
  fineRiga?: string;
};

/** Decimali massimi scritti nel file. */
const DECIMALI_MASSIMI = 3;

/** Errore di generazione del file del terminalino, con messaggio in italiano. */
export class ErroreFileTerminale extends Error {
  constructor(messaggio: string) {
    super(messaggio);
    this.name = 'ErroreFileTerminale';
  }
}

/** Tronca la quantità a 3 decimali e la spezza in parte intera e decimali già in stringa. */
function pezziQuantita(quantita: number): { segno: string; intera: string; decimali: string } {
  if (!Number.isFinite(quantita)) {
    throw new ErroreFileTerminale(`Quantità non valida per il codice: ${String(quantita)}.`);
  }
  const segno = quantita < 0 ? '-' : '';
  const assoluta = Math.abs(quantita);
  const fattore = 10 ** DECIMALI_MASSIMI;
  const troncata = Math.round(assoluta * fattore) / fattore;
  const intera = Math.floor(troncata);
  const decimali = Math.round((troncata - intera) * fattore)
    .toString()
    .padStart(DECIMALI_MASSIMI, '0')
    .replace(/0+$/, '');
  return { segno, intera: String(intera), decimali };
}

/** Formatta la quantità completa, al massimo 3 decimali e senza zeri finali. */
function quantitaCompleta(quantita: number, separatoreDecimale: string): string {
  const { segno, intera, decimali } = pezziQuantita(quantita);
  return decimali === ''
    ? `${segno}${intera}`
    : `${segno}${intera}${separatoreDecimale}${decimali}`;
}

/** Converte la scadenza nel formato `aaaammgg` atteso da Easyfatt. */
export function formattaScadenza(scadenza: string | Date): string {
  if (scadenza instanceof Date) {
    if (Number.isNaN(scadenza.getTime())) {
      throw new ErroreFileTerminale('Data di scadenza non valida.');
    }
    const anno = String(scadenza.getUTCFullYear()).padStart(4, '0');
    const mese = String(scadenza.getUTCMonth() + 1).padStart(2, '0');
    const giorno = String(scadenza.getUTCDate()).padStart(2, '0');
    return `${anno}${mese}${giorno}`;
  }
  if (/^\d{8}$/.test(scadenza)) return scadenza;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(scadenza);
  if (iso) return `${iso[1]}${iso[2]}${iso[3]}`;
  throw new ErroreFileTerminale(
    `Data di scadenza non valida: "${scadenza}". Usa il formato aaaa-mm-gg.`,
  );
}

/** Valore testuale di un campo nel formato a campi delimitati. */
function valoreDelimitato(
  lettera: LetteraDelimitata,
  riga: RigaTerminale,
  separatoreDecimale: string,
): string {
  switch (lettera) {
    case 'A':
      return riga.codice;
    case 'Q':
      return quantitaCompleta(riga.quantita, separatoreDecimale);
    case 'L':
      return riga.lotto ?? '';
    case 'S':
      return riga.scadenza === undefined ? '' : formattaScadenza(riga.scadenza);
    case 'X':
      return '';
  }
}

/** Allinea a sinistra riempiendo di spazi, troncando se il valore è più lungo del campo. */
function aSinistra(valore: string, lunghezza: number): string {
  return valore.length > lunghezza ? valore.slice(0, lunghezza) : valore.padEnd(lunghezza, ' ');
}

/** Valore testuale di un campo nel formato a spaziatura fissa. */
function valoreFisso(campo: CampoFisso, riga: RigaTerminale, decimaliPrevisti: number): string {
  switch (campo.lettera) {
    case 'A':
      return aSinistra(riga.codice, campo.lunghezza);
    case 'Q': {
      const { segno, intera, decimali } = pezziQuantita(riga.quantita);
      if (decimaliPrevisti === 0 && decimali !== '') {
        throw new ErroreFileTerminale(
          `La quantità ${riga.quantita} del codice ${riga.codice} ha decimali ma la stringa formato non prevede il campo q.`,
        );
      }
      const testo = `${segno}${intera}`;
      if (testo.length > campo.lunghezza) {
        throw new ErroreFileTerminale(
          `La quantità ${riga.quantita} del codice ${riga.codice} non entra in ${campo.lunghezza} caratteri.`,
        );
      }
      return segno + intera.padStart(campo.lunghezza - segno.length, '0');
    }
    case 'q': {
      const { decimali } = pezziQuantita(riga.quantita);
      return decimali.padEnd(campo.lunghezza, '0').slice(0, campo.lunghezza);
    }
    case 'L':
      return aSinistra(riga.lotto ?? '', campo.lunghezza);
    case 'S':
      return aSinistra(
        riga.scadenza === undefined ? '' : formattaScadenza(riga.scadenza),
        campo.lunghezza,
      );
    case 'X':
      return ' '.repeat(campo.lunghezza);
  }
}

/** Interpreta la stringa formato o solleva l'errore descrittivo. */
function formatoValido(stringaFormato: string): Extract<RisultatoStringaFormato, { ok: true }> {
  const esito = analizzaStringaFormato(stringaFormato);
  if (!esito.ok) throw new ErroreFileTerminale(esito.errore);
  return esito;
}

/**
 * Genera il testo del file da importare in Easyfatt dalle righe già aggregate.
 */
export function generaFileTerminale(
  righe: readonly RigaTerminale[],
  opzioni: OpzioniFileTerminale,
): string {
  const formato = formatoValido(opzioni.stringaFormato);
  const separatoreDecimale = opzioni.separatoreDecimale ?? '.';
  const fineRiga = opzioni.fineRiga ?? '\r\n';
  if (formato.tipo === 'delimitato' && formato.separatore === separatoreDecimale) {
    throw new ErroreFileTerminale(
      `Il separatore decimale "${separatoreDecimale}" coincide con il separatore dei campi: con il separatore virgola i decimali usano il punto.`,
    );
  }
  const decimaliPrevisti =
    formato.tipo === 'fisso'
      ? (formato.campi.find((c) => c.lettera === 'q')?.lunghezza ?? 0)
      : DECIMALI_MASSIMI;
  let testo = '';
  for (const riga of righe) {
    if (riga.codice === '') {
      throw new ErroreFileTerminale('Una riga non ha il codice prodotto.');
    }
    const parti =
      formato.tipo === 'delimitato'
        ? formato.campi.map((lettera) => valoreDelimitato(lettera, riga, separatoreDecimale))
        : formato.campi.map((campo) => valoreFisso(campo, riga, decimaliPrevisti));
    testo += parti.join(formato.tipo === 'delimitato' ? formato.separatore : '') + fineRiga;
  }
  return testo;
}
