import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { Barcode, Prezzo, Prodotto } from '@terminalinobru/core';

/**
 * Numero di listini di Easyfatt (NetPrice1..9). Ripetuto qui perché `easyfatt` importa da `core`
 * solo i tipi, per non trascinare zod nel bundle (vedi CLAUDE.md).
 */
const NUMERO_LISTINI = 9;

/** Array di nove listini assenti (null), come `prezziVuoti` di `core`. */
function prezziVuoti(): Prezzo[] {
  return new Array<Prezzo>(NUMERO_LISTINI).fill(null);
}

/** Modalità di invio del catalogo dichiarata da Easyfatt. */
export type ModalitaCatalogo = 'full' | 'incremental';

/** Esito dell'analisi di un file `EasyfattProducts`. */
export type Catalogo = {
  modalita: ModalitaCatalogo;
  magazzino?: string;
  prodotti: Prodotto[];
  barcode: Barcode[];
  codiciEliminati: string[];
};

/** Opzioni dell'analisi del catalogo. */
export type OpzioniCatalogo = {
  /** Istante da scrivere in `aggiornatoIl`. Default: adesso. */
  aggiornatoIl?: string;
};

/** Errore di lettura del catalogo, con messaggio in italiano da mostrare in Easyfatt. */
export class ErroreCatalogo extends Error {
  constructor(messaggio: string) {
    super(messaggio);
    this.name = 'ErroreCatalogo';
  }
}

/**
 * Nodo generico del documento XML già convertito in oggetti. `fast-xml-parser` non produce mai
 * `null`: i valori possibili sono stringhe, oggetti, array o `undefined`.
 */
type Nodo = Record<string, unknown>;

const PREFISSO_ATTRIBUTO = '@_';

/** Tag che devono essere sempre array, per non cambiare forma con un solo elemento. */
const TAG_ARRAY = new Set(['Product', 'ExtraBarcodes.Barcode']);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: PREFISSO_ATTRIBUTO,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  isArray: (nome, percorso) =>
    TAG_ARRAY.has(nome) || TAG_ARRAY.has(String(percorso).split('.').slice(-2).join('.')),
});

/** Legge un nodo figlio come oggetto, oppure undefined se assente. */
function oggetto(nodo: Nodo | undefined, nome: string): Nodo | undefined {
  const valore = nodo?.[nome];
  return typeof valore === 'object' ? (valore as Nodo) : undefined;
}

/** Legge un valore di testo: undefined se assente o vuoto, mai stringa vuota. */
function testo(nodo: Nodo | undefined, nome: string): string | undefined {
  const valore = nodo?.[nome];
  if (valore === undefined) return undefined;
  if (typeof valore === 'object') {
    const interno = (valore as Nodo)['#text'];
    return interno === undefined ? undefined : String(interno);
  }
  const stringa = String(valore);
  return stringa === '' ? undefined : stringa;
}

/** Legge un numero: undefined se assente o non interpretabile. */
function numero(nodo: Nodo | undefined, nome: string): number | undefined {
  const stringa = testo(nodo, nome);
  if (stringa === undefined) return undefined;
  const valore = Number(stringa.replace(',', '.'));
  return Number.isFinite(valore) ? valore : undefined;
}

/** Legge un booleano `true`/`false`/`1`/`0`, con valore di ripiego se assente. */
function booleano(nodo: Nodo | undefined, nome: string, ripiego: boolean): boolean {
  const stringa = testo(nodo, nome)?.toLowerCase();
  if (stringa === undefined) return ripiego;
  return stringa === 'true' || stringa === '1' || stringa === 'si';
}

/** Legge un attributo di un nodo. */
function attributo(nodo: Nodo | undefined, nome: string): string | undefined {
  const valore = nodo?.[`${PREFISSO_ATTRIBUTO}${nome}`];
  if (valore === undefined) return undefined;
  const stringa = String(valore);
  return stringa === '' ? undefined : stringa;
}

/** Restituisce sempre un array di valori grezzi, siano testi o nodi con attributi. */
function valori(valore: unknown): unknown[] {
  if (valore === undefined) return [];
  return Array.isArray(valore) ? valore : [valore];
}

/**
 * Restituisce sempre un array di nodi: gli elementi senza figli (`<Product/>`) diventano nodi
 * vuoti, così i campi obbligatori risultano mancanti invece di sparire.
 */
function nodi(valore: unknown): Nodo[] {
  return valori(valore).map((v) => (typeof v === 'object' ? (v as Nodo) : {}));
}

/** Legge i nove listini in un array, con null dove il listino manca. */
function listini(prodotto: Nodo, prefisso: 'NetPrice' | 'GrossPrice'): Prezzo[] {
  const prezzi = prezziVuoti();
  for (let indice = 0; indice < NUMERO_LISTINI; indice += 1) {
    const valore = numero(prodotto, `${prefisso}${indice + 1}`);
    if (valore !== undefined) prezzi[indice] = valore;
  }
  return prezzi;
}

/** Aggiunge un abbinamento barcode all'elenco, saltando i duplicati e i valori vuoti. */
function aggiungiBarcode(
  barcode: Barcode[],
  visti: Set<string>,
  valore: string | undefined,
  codiceProdotto: string,
  aggiornatoIl: string,
  quantitaConfezione?: number,
): void {
  if (valore === undefined) return;
  const pulito = valore.trim();
  if (pulito === '' || visti.has(pulito)) return;
  visti.add(pulito);
  barcode.push({
    barcode: pulito,
    codiceProdotto,
    origine: 'easyfatt',
    aggiornatoIl,
    ...(quantitaConfezione === undefined ? {} : { quantitaConfezione }),
  });
}

/** Costruisce un Prodotto di dominio dal nodo `<Product>`. */
function leggiProdotto(nodo: Nodo, codice: string, aggiornatoIl: string): Prodotto {
  const iva = oggetto(nodo, 'Vat');
  const ivaPerc =
    iva === undefined
      ? numero(nodo, 'Vat')
      : (numero(iva, `${PREFISSO_ATTRIBUTO}Perc`) ?? numero(iva, '#text'));
  const prodotto: Prodotto = {
    codice,
    descrizione: testo(nodo, 'Description') ?? '',
    prezziNetti: listini(nodo, 'NetPrice'),
    prezziLordi: listini(nodo, 'GrossPrice'),
    gestioneMagazzino: booleano(nodo, 'ManageWarehouse', true),
    aggiornatoIl,
  };
  const categoria = testo(nodo, 'Category');
  if (categoria !== undefined) prodotto.categoria = categoria;
  const sottocategoria = testo(nodo, 'Subcategory');
  if (sottocategoria !== undefined) prodotto.sottocategoria = sottocategoria;
  const um = testo(nodo, 'Um');
  if (um !== undefined) prodotto.um = um;
  if (ivaPerc !== undefined) prodotto.ivaPerc = ivaPerc;
  const ubicazione = testo(nodo, 'WarehouseLocation');
  if (ubicazione !== undefined) prodotto.ubicazione = ubicazione;
  const scortaMinima = numero(nodo, 'MinStock');
  if (scortaMinima !== undefined) prodotto.scortaMinima = scortaMinima;
  const giacenza = numero(nodo, 'AvailableQty');
  if (giacenza !== undefined) prodotto.giacenza = giacenza;
  const ordinato = numero(nodo, 'OrderedQty');
  if (ordinato !== undefined) prodotto.ordinato = ordinato;
  const fornitore = testo(nodo, 'SupplierName');
  if (fornitore !== undefined) prodotto.fornitore = fornitore;
  const codiceFornitore = testo(nodo, 'SupplierProductCode');
  if (codiceFornitore !== undefined) prodotto.codiceFornitore = codiceFornitore;
  const note = testo(nodo, 'Notes');
  if (note !== undefined) prodotto.note = note;
  return prodotto;
}

/** Legge i barcode di un prodotto: principale, aggiuntivi (con PackageQty) e delle varianti. */
function leggiBarcode(
  nodo: Nodo,
  codice: string,
  aggiornatoIl: string,
  barcode: Barcode[],
  visti: Set<string>,
): void {
  aggiungiBarcode(barcode, visti, testo(nodo, 'Barcode'), codice, aggiornatoIl);
  const extra = oggetto(nodo, 'ExtraBarcodes');
  for (const voce of valori(extra?.['Barcode'])) {
    if (typeof voce === 'object') {
      const nodoVoce = voce as Nodo;
      const quantita = numero(nodoVoce, `${PREFISSO_ATTRIBUTO}PackageQty`);
      aggiungiBarcode(
        barcode,
        visti,
        testo(nodoVoce, '#text'),
        codice,
        aggiornatoIl,
        quantita !== undefined && quantita > 0 ? quantita : undefined,
      );
    } else {
      const stringa = String(voce);
      aggiungiBarcode(barcode, visti, stringa === '' ? undefined : stringa, codice, aggiornatoIl);
    }
  }
  const varianti = oggetto(nodo, 'Variants');
  for (const variante of nodi(varianti?.['Variant'])) {
    aggiungiBarcode(barcode, visti, testo(variante, 'Barcode'), codice, aggiornatoIl);
  }
}

/** Analizza le liste di prodotti di una sezione del catalogo, in modo iterativo. */
function analizzaProdotti(
  elementi: readonly Nodo[],
  aggiornatoIl: string,
  prodotti: Prodotto[],
  barcode: Barcode[],
  visti: Set<string>,
  sezione: string,
): void {
  for (let indice = 0; indice < elementi.length; indice += 1) {
    const nodo = elementi[indice] as Nodo;
    const codice = testo(nodo, 'Code');
    if (codice === undefined) {
      throw new ErroreCatalogo(
        `Prodotto senza elemento Code in ${sezione}, posizione ${indice + 1}.`,
      );
    }
    prodotti.push(leggiProdotto(nodo, codice, aggiornatoIl));
    leggiBarcode(nodo, codice, aggiornatoIl, barcode, visti);
  }
}

/** Legge i codici della sezione `DeletedProducts`. */
function analizzaEliminati(elementi: readonly Nodo[]): string[] {
  const codici: string[] = [];
  for (let indice = 0; indice < elementi.length; indice += 1) {
    const codice = testo(elementi[indice] as Nodo, 'Code');
    if (codice === undefined) {
      throw new ErroreCatalogo(
        `Prodotto senza elemento Code in DeletedProducts, posizione ${indice + 1}.`,
      );
    }
    codici.push(codice);
  }
  return codici;
}

/**
 * Analizza un file `EasyfattProducts` (protocollo 2 o 3, modalità full o incremental).
 */
export function analizzaCatalogo(xml: string, opzioni: OpzioniCatalogo = {}): Catalogo {
  const aggiornatoIl = opzioni.aggiornatoIl ?? new Date().toISOString();
  if (xml.trim() === '') throw new ErroreCatalogo('Il file del catalogo è vuoto.');
  const validazione = XMLValidator.validate(xml);
  if (validazione !== true) {
    throw new ErroreCatalogo(
      `XML non valido: ${validazione.err.msg} (riga ${validazione.err.line}).`,
    );
  }
  const documento = parser.parse(xml) as Nodo;
  const radice = oggetto(documento, 'EasyfattProducts');
  if (radice === undefined) {
    throw new ErroreCatalogo(
      'Elemento radice EasyfattProducts non trovato: il file non è un catalogo Easyfatt.',
    );
  }
  const versione = attributo(radice, 'AppVersion');
  if (versione === undefined) {
    throw new ErroreCatalogo('Attributo AppVersion mancante in EasyfattProducts.');
  }
  if (versione !== '2' && versione !== '3') {
    throw new ErroreCatalogo(
      `Versione del protocollo non supportata: ${versione}. Sono supportate la 2 e la 3.`,
    );
  }
  const modalita = attributo(radice, 'Mode');
  if (modalita === undefined) {
    throw new ErroreCatalogo('Attributo Mode mancante in EasyfattProducts.');
  }
  if (modalita !== 'full' && modalita !== 'incremental') {
    throw new ErroreCatalogo(
      `Modalità non riconosciuta: ${modalita}. Sono ammesse full e incremental.`,
    );
  }
  const prodotti: Prodotto[] = [];
  const barcode: Barcode[] = [];
  const visti = new Set<string>();
  let codiciEliminati: string[] = [];
  if (modalita === 'full') {
    const sezione = oggetto(radice, 'Products');
    analizzaProdotti(
      nodi(sezione?.['Product']),
      aggiornatoIl,
      prodotti,
      barcode,
      visti,
      'Products',
    );
  } else {
    const aggiornati = oggetto(radice, 'UpdatedProducts');
    analizzaProdotti(
      nodi(aggiornati?.['Product']),
      aggiornatoIl,
      prodotti,
      barcode,
      visti,
      'UpdatedProducts',
    );
    const eliminati = oggetto(radice, 'DeletedProducts');
    codiciEliminati = analizzaEliminati(nodi(eliminati?.['Product']));
  }
  const magazzino = attributo(radice, 'Warehouse');
  return {
    modalita,
    ...(magazzino === undefined ? {} : { magazzino }),
    prodotti,
    barcode,
    codiciEliminati,
  };
}
