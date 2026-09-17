import { strFromU8, unzipSync } from 'fflate';

/** Errore di lettura di un file Excel, con messaggio in italiano. */
export class ErroreXlsx extends Error {
  constructor(messaggio: string) {
    super(messaggio);
    this.name = 'ErroreXlsx';
  }
}

const STRINGHE_CONDIVISE = 'xl/sharedStrings.xml';
const PRIMO_FOGLIO = 'xl/worksheets/sheet1.xml';

/**
 * Scrive in cifre un numero che Excel ha salvato in notazione esponenziale (`3.32235017E+9` →
 * `3322350170`), senza passare dai `number` di JavaScript, che oltre 15 cifre arrotondano. Un
 * valore già in cifre, o che non è un numero, torna com'è.
 */
export function numeroComeTesto(valore: string): string {
  const corrispondenza = /^([+-]?)(\d*)(?:\.(\d*))?[eE]([+-]?\d+)$/.exec(valore.trim());
  if (!corrispondenza) return valore;
  const [, segno = '', intera = '', decimale = '', esponente = '0'] = corrispondenza;
  if (intera === '' && decimale === '') return valore;
  const cifre = intera + decimale;
  // Posizione della virgola dall'inizio delle cifre, dopo lo spostamento.
  const virgola = intera.length + Number(esponente);
  let testo: string;
  if (virgola <= 0) testo = `0.${'0'.repeat(-virgola)}${cifre}`;
  else if (virgola >= cifre.length) testo = cifre + '0'.repeat(virgola - cifre.length);
  else testo = `${cifre.slice(0, virgola)}.${cifre.slice(virgola)}`;
  if (testo.includes('.')) testo = testo.replace(/0+$/, '').replace(/\.$/, '');
  testo = testo.replace(/^0+(?=\d)/, '');
  return segno === '-' && /[1-9]/.test(testo) ? `-${testo}` : testo;
}

/** Indice di colonna (0 = A) dal riferimento di cella, per esempio `AB12` → 27. */
export function indiceColonna(riferimento: string): number | undefined {
  const lettere = /^([A-Za-z]+)\d*$/.exec(riferimento)?.[1];
  if (lettere === undefined) return undefined;
  let indice = 0;
  for (const lettera of lettere.toUpperCase()) indice = indice * 26 + (lettera.charCodeAt(0) - 64);
  return indice - 1;
}

function analizzaXml(testo: string, parte: string): Document {
  const documento = new DOMParser().parseFromString(testo, 'application/xml');
  if (documento.getElementsByTagName('parsererror').length > 0) {
    throw new ErroreXlsx(`Il file Excel è danneggiato (${parte} non leggibile).`);
  }
  return documento;
}

/** Figli diretti con quel nome locale, qualunque sia il prefisso del namespace. */
function figli(elemento: Element, nome: string): Element[] {
  return [...elemento.children].filter((figlio) => figlio.localName === nome);
}

/** Testo di un elemento `si` o `is`: le sue `t`, anche dentro le parti formattate, senza la fonetica. */
function testoRicco(elemento: Element): string {
  let testo = '';
  for (const t of elemento.getElementsByTagNameNS('*', 't')) {
    let genitore = t.parentElement;
    let fonetica = false;
    while (genitore && genitore !== elemento) {
      if (genitore.localName === 'rPh') fonetica = true;
      genitore = genitore.parentElement;
    }
    if (!fonetica) testo += t.textContent ?? '';
  }
  return testo;
}

/** Elenco di `xl/sharedStrings.xml`: le celle `t="s"` ne portano l'indice. */
export function leggiStringheCondivise(xml: string): string[] {
  const documento = analizzaXml(xml, 'stringhe condivise');
  return figli(documento.documentElement, 'si').map(testoRicco);
}

function valoreCella(cella: Element, stringhe: readonly string[]): string {
  const tipo = cella.getAttribute('t');
  const v = figli(cella, 'v')[0]?.textContent ?? '';
  switch (tipo) {
    case 's': {
      const indice = Number(v);
      return Number.isInteger(indice) ? (stringhe[indice] ?? '') : '';
    }
    case 'inlineStr': {
      const is = figli(cella, 'is')[0];
      return is ? testoRicco(is) : '';
    }
    case 'str':
    case 'b':
      return v;
    case 'e':
      return '';
    default:
      // Numero (anche una data, che Easyfatt nell'export clienti non usa): testo senza esponente.
      return numeroComeTesto(v);
  }
}

/**
 * Tabella di celle di testo da `xl/worksheets/sheetN.xml`. L'indice della riga nella tabella è il
 * numero della riga di Excel meno uno, così gli avvisi citano le righe che l'utente vede; le celle
 * e le righe che Excel non scrive diventano vuote.
 */
export function leggiFoglio(xml: string, stringhe: readonly string[]): string[][] {
  const documento = analizzaXml(xml, 'foglio');
  const tabella: string[][] = [];
  for (const riga of documento.getElementsByTagNameNS('*', 'row')) {
    const numero = Number(riga.getAttribute('r'));
    const indiceRiga = Number.isInteger(numero) && numero >= 1 ? numero - 1 : tabella.length;
    while (tabella.length < indiceRiga) tabella.push([]);
    const celle: string[] = [];
    for (const cella of figli(riga, 'c')) {
      const colonna = indiceColonna(cella.getAttribute('r') ?? '') ?? celle.length;
      while (celle.length < colonna) celle.push('');
      celle[colonna] = valoreCella(cella, stringhe);
    }
    tabella[indiceRiga] = celle;
  }
  return tabella;
}

/**
 * Legge il primo foglio di un file `.xlsx` come tabella di testo (docs/DECISIONI.md punto 58).
 * Apre lo zip con `fflate` ed estrae solo le due parti che servono.
 */
export function leggiXlsx(contenuto: Uint8Array): string[][] {
  let parti: Record<string, Uint8Array>;
  try {
    parti = unzipSync(contenuto, {
      filter: (file) => file.name === STRINGHE_CONDIVISE || file.name.startsWith('xl/worksheets/'),
    });
  } catch {
    throw new ErroreXlsx('Il file non è un Excel .xlsx leggibile.');
  }
  const foglio =
    parti[PRIMO_FOGLIO] ??
    Object.entries(parti)
      .filter(([nome]) => /^xl\/worksheets\/[^/]+\.xml$/.test(nome))
      .sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))[0]?.[1];
  if (foglio === undefined) {
    throw new ErroreXlsx('Nel file Excel non c’è nessun foglio.');
  }
  const condivise = parti[STRINGHE_CONDIVISE];
  const stringhe = condivise ? leggiStringheCondivise(strFromU8(condivise)) : [];
  return leggiFoglio(strFromU8(foglio), stringhe);
}
