import { z } from 'zod';

/** Numero di listini gestiti da Easyfatt (NetPrice1..9 e GrossPrice1..9). */
export const NUMERO_LISTINI = 9;

/**
 * Prezzo di un listino: numero oppure NaN quando il listino non è valorizzato
 * (vedi docs/MODELLO-DATI.md sezione 1).
 */
const schemaPrezzo = z.union([z.number(), z.nan()]);

/** Array di listini lungo {@link NUMERO_LISTINI}, riempito di NaN per i listini assenti. */
const schemaPrezzi = z
  .array(schemaPrezzo)
  .max(NUMERO_LISTINI)
  .default(() => prezziVuoti());

/** Array di listini tutti assenti, da usare come valore di default. */
export function prezziVuoti(): number[] {
  return new Array<number>(NUMERO_LISTINI).fill(Number.NaN);
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
