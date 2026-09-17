import { z } from 'zod';

/** Numero di listini gestiti da Easyfatt (NetPrice1..9 e GrossPrice1..9). */
export const NUMERO_LISTINI = 9;

/**
 * Prezzo di un listino: numero oppure null quando il listino non è valorizzato
 * (vedi docs/MODELLO-DATI.md sezione 1). Si usa null e non NaN perché sopravvive a JSON.
 */
const schemaPrezzo = z.number().nullable();

/** Prezzo di un listino, null se assente. */
export type Prezzo = z.output<typeof schemaPrezzo>;

/** Array di listini lungo {@link NUMERO_LISTINI}, riempito di null per i listini assenti. */
const schemaPrezzi = z
  .array(schemaPrezzo)
  .max(NUMERO_LISTINI)
  .default(() => prezziVuoti());

/** Array di listini tutti assenti, da usare come valore di default. */
export function prezziVuoti(): Prezzo[] {
  return new Array<Prezzo>(NUMERO_LISTINI).fill(null);
}

/** Schema di un prodotto di catalogo, con chiave il codice Easyfatt. */
export const schemaProdotto = z.object({
  codice: z.string().min(1),
  descrizione: z.string(),
  categoria: z.string().optional(),
  sottocategoria: z.string().optional(),
  um: z.string().optional(),
  prezziNetti: schemaPrezzi,
  prezziLordi: schemaPrezzi,
  ivaPerc: z.number().optional(),
  gestioneMagazzino: z.boolean().default(true),
  ubicazione: z.string().optional(),
  scortaMinima: z.number().optional(),
  giacenza: z.number().optional(),
  ordinato: z.number().optional(),
  fornitore: z.string().optional(),
  codiceFornitore: z.string().optional(),
  note: z.string().optional(),
  aggiornatoIl: z.string().min(1),
  eliminatoIl: z.string().min(1).optional(),
});

/** Prodotto di catalogo. */
export type Prodotto = z.output<typeof schemaProdotto>;

/** Origine di un abbinamento barcode: dal catalogo Easyfatt o creato in app. */
export const schemaOrigineBarcode = z.enum(['easyfatt', 'app']);

/** Origine di un abbinamento barcode. */
export type OrigineBarcode = z.output<typeof schemaOrigineBarcode>;

/** Schema di un abbinamento barcode → codice prodotto. */
export const schemaBarcode = z.object({
  barcode: z.string().min(1),
  codiceProdotto: z.string().min(1),
  origine: schemaOrigineBarcode,
  quantitaConfezione: z.number().positive().optional(),
  aggiornatoIl: z.string().min(1),
  eliminatoIl: z.string().min(1).optional(),
});

/** Abbinamento barcode → codice prodotto. */
export type Barcode = z.output<typeof schemaBarcode>;

/** Tipi di sessione previsti in v1. */
export const schemaTipoSessione = z.enum(['inventario', 'ddt', 'carico']);

/** Tipo di sessione. */
export type TipoSessione = z.output<typeof schemaTipoSessione>;

/** Stati possibili di una sessione. */
export const schemaStatoSessione = z.enum(['aperta', 'chiusa', 'esportata', 'importata']);

/** Stato di una sessione. */
export type StatoSessione = z.output<typeof schemaStatoSessione>;

/** Modalità di scansione: chiedere la quantità oppure sommare uno per lettura. */
export const schemaModalitaScansione = z.enum(['chiedi_quantita', 'somma_uno']);

/** Modalità di scansione. */
export type ModalitaScansione = z.output<typeof schemaModalitaScansione>;

/** Schema di una riga di sessione. */
export const schemaRiga = z.object({
  id: z.string().min(1),
  sessioneId: z.string().min(1),
  codiceProdotto: z.string().min(1),
  quantita: z.number().finite(),
  barcodeLetto: z.string().min(1).optional(),
  lettaIl: z.string().min(1),
  ordine: z.number().int().nonnegative(),
});

/** Riga di sessione: una lettura o una quantità digitata. */
export type Riga = z.output<typeof schemaRiga>;

/** Espressioni regolari dei campi fiscali e di contatto del cliente. */
const RE_PARTITA_IVA = /^\d{11}$/;
const RE_CODICE_FISCALE = /^(?:\d{11}|[A-Za-z0-9]{16})$/;
const RE_CODICE_DESTINATARIO = /^[A-Za-z0-9]{7}$/;
const RE_PROVINCIA = /^[A-Za-z]{2}$/;
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Schema dell'email: plausibile, non verificata. */
const schemaEmail = z.string().regex(RE_EMAIL, "L'email non è valida.");

/**
 * Schema dei campi del cliente che finiscono nel documento (tag `Customer*` di Easyfatt-XML).
 * Tutti facoltativi tranne il nome, ma validati se presenti.
 */
export const schemaClienteDocumento = z.object({
  codice: z.string().min(1, 'Il codice cliente non può essere vuoto.').optional(),
  nome: z
    .string({ error: 'La ragione sociale è obbligatoria.' })
    .trim()
    .min(1, 'La ragione sociale è obbligatoria.'),
  partitaIva: z.string().regex(RE_PARTITA_IVA, 'La partita IVA deve avere 11 cifre.').optional(),
  codiceFiscale: z
    .string()
    .regex(RE_CODICE_FISCALE, 'Il codice fiscale deve avere 16 caratteri oppure 11 cifre.')
    .optional(),
  indirizzo: z.string().optional(),
  cap: z.string().optional(),
  citta: z.string().optional(),
  provincia: z.string().regex(RE_PROVINCIA, 'La provincia deve essere di 2 lettere.').optional(),
  nazione: z.string().optional(),
  sdi: z
    .string()
    .refine(
      (valore) => RE_CODICE_DESTINATARIO.test(valore) || RE_EMAIL.test(valore),
      'Il codice destinatario deve avere 7 caratteri, oppure indicare una PEC.',
    )
    .optional(),
  telefono: z.string().optional(),
  email: schemaEmail.optional(),
});

/** Campi del cliente che finiscono nel documento. */
export type ClienteDocumento = z.output<typeof schemaClienteDocumento>;

/** Origine di un cliente: dall'export di Easyfatt o creato in app. */
export const schemaOrigineCliente = z.enum(['easyfatt', 'app']);

/** Origine di un cliente. */
export type OrigineCliente = z.output<typeof schemaOrigineCliente>;

/** Schema dell'anagrafica cliente sul telefono. */
export const schemaCliente = schemaClienteDocumento.extend({
  id: z.string().min(1),
  origine: schemaOrigineCliente,
  listino: z.number().int().min(1).max(NUMERO_LISTINI).optional(),
  aggiornatoIl: z.string().min(1),
  eliminatoIl: z.string().min(1).optional(),
});

/** Anagrafica cliente: dall'export di Easyfatt oppure creata in app. */
export type Cliente = z.output<typeof schemaCliente>;

/** Schema di una sessione di lavoro (inventario, DDT o carico). */
export const schemaSessione = z.object({
  id: z.string().min(1),
  tipo: schemaTipoSessione,
  nome: z.string().min(1),
  note: z.string().optional(),
  stato: schemaStatoSessione.default('aperta'),
  modalita: schemaModalitaScansione.default('chiedi_quantita'),
  creataIl: z.string().min(1),
  chiusaIl: z.string().min(1).optional(),
  dispositivo: z.string().optional(),
  cliente: schemaClienteDocumento.optional(),
  numeroDocumento: z.number().int().positive().optional(),
  righe: z.array(schemaRiga).optional(),
});

/** Sessione di lavoro con le sue righe. */
export type Sessione = z.output<typeof schemaSessione>;

/** Schema delle impostazioni dell'app, con tutti i valori di default. */
export const schemaImpostazioni = z.object({
  urlBridge: z.string().default(''),
  token: z.string().default(''),
  stringaFormato: z.string().min(1).default('A,Q'),
  separatoreDecimale: z.enum(['.', ',']).default('.'),
  listinoMostrato: z.number().int().min(1).max(NUMERO_LISTINI).default(1),
  modalitaPredefinita: schemaModalitaScansione.default('chiedi_quantita'),
  suoni: z.boolean().default(true),
  vibrazione: z.boolean().default(true),
  dispositivo: z.string().default(''),
  ultimaSincronizzazione: z.string().min(1).optional(),
});

/** Impostazioni dell'app. */
export type Impostazioni = z.output<typeof schemaImpostazioni>;

/** Impostazioni di partenza usate alla prima apertura dell'app. */
export const IMPOSTAZIONI_DEFAULT: Impostazioni = schemaImpostazioni.parse({});

/** Fine riga predefinita del file terminalino (vedi docs/PROTOCOLLI-DANEA.md sezione 1.2). */
export const FINE_RIGA_DEFAULT = '\r\n';
