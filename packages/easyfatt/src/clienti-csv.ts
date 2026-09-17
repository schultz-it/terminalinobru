import type { Cliente } from '@terminalinobru/core';

/** Esito della lettura dell'export clienti. */
export type ClientiCsv = {
  clienti: Cliente[];
  /** Righe scartate, codici ripetuti e colonne utili non trovate, in italiano. */
  avvisi: string[];
};

/** Opzioni della lettura dell'export clienti. */
export type OpzioniClientiCsv = {
  /** Istante da scrivere in `aggiornatoIl`. Default: adesso. */
  aggiornatoIl?: string;
};

/** Errore che rende inutilizzabile l'export clienti, con messaggio in italiano. */
export class ErroreClientiCsv extends Error {
  constructor(messaggio: string) {
    super(messaggio);
    this.name = 'ErroreClientiCsv';
  }
}

/** Campi del cliente ricavabili dall'export, più la PEC usata come ripiego del codice destinatario. */
type CampoCsv =
  | 'codice'
  | 'nome'
  | 'partitaIva'
  | 'codiceFiscale'
  | 'indirizzo'
  | 'cap'
  | 'citta'
  | 'provincia'
  | 'nazione'
  | 'sdi'
  | 'pec'
  | 'telefono'
  | 'email'
  | 'listino';

/**
 * Intestazioni riconosciute per ogni campo, già normalizzate, in ordine di preferenza: se il file
 * ha sia "Denominazione" sia "Nome" vince "Denominazione".
 */
const INTESTAZIONI: Record<CampoCsv, readonly string[]> = {
  codice: ['codice', 'cod', 'codicecliente', 'codcliente'],
  nome: ['denominazione', 'ragionesociale', 'nominativo', 'nome'],
  partitaIva: ['partitaiva', 'piva', 'codiceiva'],
  codiceFiscale: ['codicefiscale', 'codfiscale', 'cf'],
  indirizzo: ['indirizzo'],
  cap: ['cap'],
  citta: ['citta', 'comune', 'localita'],
  provincia: ['provincia', 'prov'],
  nazione: ['nazione', 'paese'],
  sdi: ['codicedestinatario', 'coddestinatario', 'codicesdi', 'sdi'],
  pec: ['pec', 'indirizzopec'],
  telefono: ['telefono', 'tel'],
  email: ['email', 'mail', 'indirizzoemail'],
  listino: ['listino'],
};

/** Colonne facoltative di cui si segnala l'assenza (docs/DECISIONI.md punto 54). */
const COLONNE_SEGNALATE: readonly [CampoCsv, string][] = [
  ['partitaIva', 'partita IVA'],
  ['codiceFiscale', 'codice fiscale'],
  ['citta', 'città'],
  ['listino', 'listino'],
];

/** Campi copiati tali e quali (dopo il trim) nel cliente. */
const CAMPI_TESTO = [
  'partitaIva',
  'codiceFiscale',
  'indirizzo',
  'cap',
  'citta',
  'nazione',
  'telefono',
  'email',
] as const;

/** Intestazione in forma di confronto: minuscola, senza accenti né punteggiatura. */
function normalizzaIntestazione(testo: string): string {
  return testo
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Record del CSV con il numero di riga del file in cui comincia. */
type RecordCsv = { campi: string[]; riga: number };

/** Sceglie il separatore contando `;` e `,` fuori dalle virgolette nella prima riga. */
function rilevaSeparatore(testo: string): ';' | ',' {
  let traVirgolette = false;
  let puntiEVirgola = 0;
  let virgole = 0;
  for (const carattere of testo) {
    if (carattere === '"') traVirgolette = !traVirgolette;
    else if (!traVirgolette && (carattere === '\n' || carattere === '\r')) break;
    else if (!traVirgolette && carattere === ';') puntiEVirgola += 1;
    else if (!traVirgolette && carattere === ',') virgole += 1;
  }
  return virgole > puntiEVirgola ? ',' : ';';
}

/** Divide il testo in record, gestendo virgolette, virgolette raddoppiate e a capo nei campi. */
function leggiRecord(testo: string, separatore: string): RecordCsv[] {
  const record: RecordCsv[] = [];
  let campi: string[] = [];
  let campo = '';
  let traVirgolette = false;
  let riga = 1;
  let inizio = 1;
  const chiudiRecord = () => {
    campi.push(campo);
    if (campi.some((c) => c.trim() !== '')) record.push({ campi, riga: inizio });
    campi = [];
    campo = '';
  };
  for (let i = 0; i < testo.length; i += 1) {
    const carattere = testo[i] as string;
    if (traVirgolette) {
      if (carattere === '"' && testo[i + 1] === '"') {
        campo += '"';
        i += 1;
      } else if (carattere === '"') {
        traVirgolette = false;
      } else {
        if (carattere === '\n') riga += 1;
        campo += carattere;
      }
    } else if (carattere === '"') {
      traVirgolette = true;
    } else if (carattere === separatore) {
      campi.push(campo);
      campo = '';
    } else if (carattere === '\n' || carattere === '\r') {
      if (carattere === '\r' && testo[i + 1] === '\n') i += 1;
      chiudiRecord();
      riga += 1;
      inizio = riga;
    } else {
      campo += carattere;
    }
  }
  chiudiRecord();
  return record;
}

/** Numero di listino da "2" o "Listino 2", undefined altrimenti. */
function leggiListino(testo: string): number | undefined {
  const parti = /^(?:listino\s*)?([1-9])$/i.exec(testo);
  return parti === null ? undefined : Number(parti[1]);
}

/**
 * Legge l'export clienti di Easyfatt salvato come CSV (separatore `;` o `,`, virgolette, BOM,
 * CRLF). Le colonne sono abbinate per nome; righe senza codice o nome sono scartate con avviso,
 * e un codice ripetuto tiene l'ultima riga.
 */
export function analizzaClientiCsv(testo: string, opzioni: OpzioniClientiCsv = {}): ClientiCsv {
  const aggiornatoIl = opzioni.aggiornatoIl ?? new Date().toISOString();
  const pulito = testo.replace(/^\uFEFF/, '');
  const record = leggiRecord(pulito, rilevaSeparatore(pulito));
  const [intestazione, ...righe] = record;
  if (intestazione === undefined) throw new ErroreClientiCsv('Il file dei clienti è vuoto.');

  const normalizzate = intestazione.campi.map(normalizzaIntestazione);
  const colonne = {} as Record<CampoCsv, number>;
  for (const [campo, sinonimi] of Object.entries(INTESTAZIONI) as [CampoCsv, string[]][]) {
    const trovata = sinonimi.map((s) => normalizzate.indexOf(s)).find((indice) => indice >= 0);
    colonne[campo] = trovata ?? -1;
  }
  if (colonne.codice < 0) {
    throw new ErroreClientiCsv(
      'Colonna del codice cliente non trovata: serve una colonna "Codice", "Cod." o "Codice cliente".',
    );
  }
  if (colonne.nome < 0) {
    throw new ErroreClientiCsv(
      'Colonna del nome non trovata: serve una colonna "Denominazione", "Ragione sociale", "Nome" o "Nominativo".',
    );
  }

  const avvisi: string[] = [];
  for (const [campo, etichetta] of COLONNE_SEGNALATE) {
    if (colonne[campo] < 0) avvisi.push(`Colonna ${etichetta} non trovata nel file.`);
  }

  const clienti = new Map<string, { cliente: Cliente; riga: number }>();
  for (const { campi, riga } of righe) {
    const leggi = (campo: CampoCsv): string | undefined => {
      const valore = campi[colonne[campo]]?.trim();
      return valore === undefined || valore === '' ? undefined : valore;
    };
    const codice = leggi('codice');
    const nome = leggi('nome');
    if (codice === undefined || nome === undefined) {
      avvisi.push(
        `Riga ${riga}: manca ${codice === undefined ? 'il codice' : 'il nome'}, riga scartata.`,
      );
      continue;
    }
    const cliente: Cliente = { id: codice, codice, nome, origine: 'easyfatt', aggiornatoIl };
    for (const campo of CAMPI_TESTO) {
      const valore = leggi(campo);
      if (valore !== undefined) cliente[campo] = valore;
    }
    const provincia = leggi('provincia');
    if (provincia !== undefined) cliente.provincia = provincia.toUpperCase();
    const sdi = leggi('sdi') ?? leggi('pec');
    if (sdi !== undefined) cliente.sdi = sdi;
    const listino = leggi('listino');
    const numeroListino = listino === undefined ? undefined : leggiListino(listino);
    if (numeroListino !== undefined) cliente.listino = numeroListino;

    const precedente = clienti.get(codice);
    if (precedente !== undefined) {
      avvisi.push(
        `Riga ${riga}: codice ${codice} già presente alla riga ${precedente.riga}, vale questa riga.`,
      );
    }
    clienti.set(codice, { cliente, riga });
  }
  if (clienti.size === 0) {
    throw new ErroreClientiCsv('Il file non contiene nessun cliente valido.');
  }
  return { clienti: [...clienti.values()].map((voce) => voce.cliente), avvisi };
}
