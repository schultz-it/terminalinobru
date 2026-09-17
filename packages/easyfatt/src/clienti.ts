import type { Cliente } from '@terminalinobru/core';

/** Esito dell'interpretazione dell'export clienti. */
export type TabellaClienti = {
  clienti: Cliente[];
  /** Righe scartate, codici ripetuti e colonne utili non trovate, in italiano. */
  avvisi: string[];
};

/** Opzioni dell'interpretazione dell'export clienti. */
export type OpzioniClienti = {
  /** Istante da scrivere in `aggiornatoIl`. Default: adesso. */
  aggiornatoIl?: string;
};

/** Errore che rende inutilizzabile l'export clienti, con messaggio in italiano. */
export class ErroreTabellaClienti extends Error {
  constructor(messaggio: string) {
    super(messaggio);
    this.name = 'ErroreTabellaClienti';
  }
}

/**
 * Campi del cliente ricavabili dall'export, più la PEC (ripiego del codice destinatario) e il
 * cellulare (ripiego del telefono).
 */
type CampoTabella =
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
  | 'cellulare'
  | 'email'
  | 'listino';

/**
 * Intestazioni riconosciute per ogni campo, già normalizzate, in ordine di preferenza: se il file
 * ha sia "Denominazione" sia "Nome" vince "Denominazione". Le prime sono quelle dell'export
 * "Soggetti" di Easyfatt (docs/TASK.md, T12).
 */
const INTESTAZIONI: Record<CampoTabella, readonly string[]> = {
  codice: ['cod', 'codice', 'codicecliente', 'codcliente'],
  nome: ['denominazione', 'ragionesociale', 'nominativo', 'nome'],
  partitaIva: ['partitaiva', 'piva', 'codiceiva'],
  codiceFiscale: ['codicefiscale', 'codfiscale', 'cf'],
  indirizzo: ['indirizzo'],
  cap: ['cap'],
  citta: ['citta', 'comune', 'localita'],
  provincia: ['prov', 'provincia'],
  nazione: ['nazione', 'paese'],
  sdi: [
    'coddestinatariofattelettr',
    'codicedestinatariofattelettr',
    'coddestinatariofatturaelettronica',
    'codicedestinatariofatturaelettronica',
    'codicedestinatario',
    'coddestinatario',
    'codicesdi',
    'sdi',
  ],
  pec: ['pec', 'indirizzopec'],
  telefono: ['tel', 'telefono'],
  cellulare: ['cell', 'cellulare'],
  email: ['email', 'mail', 'indirizzoemail'],
  listino: ['listino'],
};

/** Colonne facoltative di cui si segnala l'assenza (docs/DECISIONI.md punto 54). */
const COLONNE_SEGNALATE: readonly [CampoTabella, string][] = [
  ['partitaIva', 'partita IVA'],
  ['codiceFiscale', 'codice fiscale'],
  ['citta', 'città'],
  ['listino', 'listino'],
];

/** Campi copiati tali e quali (dopo il trim) nel cliente. */
const CAMPI_TESTO = ['indirizzo', 'cap', 'citta', 'nazione', 'email'] as const;

/** Lunghezza di partita IVA e codice fiscale numerici italiani. */
const CIFRE_FISCALI = 11;

/** Intestazione in forma di confronto: minuscola, senza accenti né punteggiatura. */
function normalizzaIntestazione(testo: string): string {
  return testo
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

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

/**
 * Legge un CSV (separatore `;` o `,` rilevato, virgolette, virgolette raddoppiate, a capo nei
 * campi, BOM, CRLF) in una tabella di celle di testo. Ogni record del file è una riga della
 * tabella, anche se vuoto, così i numeri di riga negli avvisi coincidono con quelli del file.
 */
export function leggiCsv(testo: string): string[][] {
  const pulito = testo.replace(/^\uFEFF/, '');
  if (pulito === '') return [];
  const separatore = rilevaSeparatore(pulito);
  const righe: string[][] = [];
  let campi: string[] = [];
  let campo = '';
  let traVirgolette = false;
  for (let i = 0; i < pulito.length; i += 1) {
    const carattere = pulito[i] as string;
    if (traVirgolette) {
      if (carattere === '"' && pulito[i + 1] === '"') {
        campo += '"';
        i += 1;
      } else if (carattere === '"') {
        traVirgolette = false;
      } else {
        campo += carattere;
      }
    } else if (carattere === '"') {
      traVirgolette = true;
    } else if (carattere === separatore) {
      campi.push(campo);
      campo = '';
    } else if (carattere === '\n' || carattere === '\r') {
      if (carattere === '\r' && pulito[i + 1] === '\n') i += 1;
      campi.push(campo);
      righe.push(campi);
      campi = [];
      campo = '';
    } else {
      campo += carattere;
    }
  }
  // L'ultimo record esiste solo se il testo non finisce con un a capo.
  if (campi.length > 0 || campo !== '') {
    campi.push(campo);
    righe.push(campi);
  }
  return righe;
}

/** Numero di listino da "2" o "Listino 2", undefined altrimenti. */
function leggiListino(testo: string): number | undefined {
  const parti = /^(?:listino\s*)?([1-9])$/i.exec(testo);
  return parti === null ? undefined : Number(parti[1]);
}

/**
 * Partita IVA o codice fiscale come li vuole Easyfatt: maiuscoli, senza spazi, trattini e punti
 * (nell'export reale compaiono "RSSMRA 80A01 H501U" e partite IVA estere con i trattini) e, se
 * numerici ma accorciati da Excel (che perde gli zeri iniziali), riportati a 11 cifre.
 */
function codiceFiscaleOIva(testo: string): string {
  const maiuscolo = testo.replace(/[\s.-]/g, '').toUpperCase();
  return /^\d+$/.test(maiuscolo) && maiuscolo.length < CIFRE_FISCALI
    ? maiuscolo.padStart(CIFRE_FISCALI, '0')
    : maiuscolo;
}

function vuota(riga: readonly string[]): boolean {
  return riga.every((cella) => cella.trim() === '');
}

/**
 * Interpreta la tabella dell'export "Soggetti" di Easyfatt (prima riga = intestazioni, celle già
 * come testo, da CSV o da Excel) e restituisce i clienti con `origine: 'easyfatt'`. Le colonne
 * sono abbinate per nome; le righe vuote vengono ignorate, quelle senza codice o nome scartate con
 * avviso, e un codice ripetuto tiene l'ultima riga. I numeri di riga degli avvisi sono quelli
 * della tabella (in Excel, il numero della riga).
 */
export function analizzaClientiTabella(
  righe: readonly (readonly string[])[],
  opzioni: OpzioniClienti = {},
): TabellaClienti {
  const aggiornatoIl = opzioni.aggiornatoIl ?? new Date().toISOString();
  const intestazione = righe[0];
  if (intestazione === undefined || vuota(intestazione)) {
    throw new ErroreTabellaClienti('Il file dei clienti è vuoto.');
  }

  const normalizzate = intestazione.map(normalizzaIntestazione);
  const colonne = {} as Record<CampoTabella, number>;
  for (const [campo, sinonimi] of Object.entries(INTESTAZIONI) as [CampoTabella, string[]][]) {
    const trovata = sinonimi.map((s) => normalizzate.indexOf(s)).find((indice) => indice >= 0);
    colonne[campo] = trovata ?? -1;
  }
  if (colonne.codice < 0) {
    throw new ErroreTabellaClienti(
      'Colonna del codice cliente non trovata: serve una colonna "Cod.", "Codice" o "Codice cliente".',
    );
  }
  if (colonne.nome < 0) {
    throw new ErroreTabellaClienti(
      'Colonna del nome non trovata: serve una colonna "Denominazione", "Ragione sociale", "Nome" o "Nominativo".',
    );
  }

  const avvisi: string[] = [];
  for (const [campo, etichetta] of COLONNE_SEGNALATE) {
    if (colonne[campo] < 0) avvisi.push(`Colonna ${etichetta} non trovata nel file.`);
  }

  const clienti = new Map<string, { cliente: Cliente; riga: number }>();
  for (let indice = 1; indice < righe.length; indice += 1) {
    const campi = righe[indice] as readonly string[];
    const riga = indice + 1;
    if (vuota(campi)) continue;
    const leggi = (campo: CampoTabella): string | undefined => {
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
    const partitaIva = leggi('partitaIva');
    if (partitaIva !== undefined) cliente.partitaIva = codiceFiscaleOIva(partitaIva);
    const codiceFiscale = leggi('codiceFiscale');
    if (codiceFiscale !== undefined) cliente.codiceFiscale = codiceFiscaleOIva(codiceFiscale);
    const provincia = leggi('provincia');
    if (provincia !== undefined) cliente.provincia = provincia.toUpperCase();
    const sdi = leggi('sdi') ?? leggi('pec');
    if (sdi !== undefined) cliente.sdi = sdi;
    const telefono = leggi('telefono') ?? leggi('cellulare');
    if (telefono !== undefined) cliente.telefono = telefono;
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
    throw new ErroreTabellaClienti('Il file non contiene nessun cliente valido.');
  }
  return { clienti: [...clienti.values()].map((voce) => voce.cliente), avvisi };
}

/** Ripiego per un export salvato come CSV: `leggiCsv` più `analizzaClientiTabella`. */
export function analizzaClientiCsv(testo: string, opzioni: OpzioniClienti = {}): TabellaClienti {
  return analizzaClientiTabella(leggiCsv(testo), opzioni);
}
