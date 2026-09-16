/**
 * Protocolli Danea Easyfatt: catalogo prodotti, file del terminalino, Easyfatt-XML.
 * Vedi docs/PROTOCOLLI-DANEA.md.
 */

/** Valida e interpreta la stringa formato del terminalino, o spiega in italiano cos'è sbagliato. */
export { analizzaStringaFormato } from './stringa-formato.js';
/** Lettere ammesse nella stringa formato: A Q q L S X. */
export { LETTERE_AMMESSE } from './stringa-formato.js';
export type {
  CampoFisso,
  FormatoDelimitato,
  FormatoFisso,
  FormatoNonValido,
  LetteraDelimitata,
  LetteraFormato,
  RisultatoStringaFormato,
} from './stringa-formato.js';

/** Genera il testo del file del terminalino dalle righe già aggregate. */
export { generaFileTerminale } from './file-terminale.js';
/** Converte una scadenza nel formato `aaaammgg` atteso da Easyfatt. */
export { formattaScadenza } from './file-terminale.js';
/** Errore di generazione del file del terminalino, con messaggio in italiano. */
export { ErroreFileTerminale } from './file-terminale.js';
export type { OpzioniFileTerminale, RigaTerminale } from './file-terminale.js';

/** Analizza un file `EasyfattProducts` (protocollo 2 o 3, modalità full o incremental). */
export { analizzaCatalogo } from './catalogo.js';
/** Errore di lettura del catalogo, con messaggio in italiano da mostrare in Easyfatt. */
export { ErroreCatalogo } from './catalogo.js';
export type { Catalogo, ModalitaCatalogo, OpzioniCatalogo } from './catalogo.js';

/** Genera l'`EasyfattDocuments` vuoto con cui il bridge risponde al polling in v1. */
export { generaDocumentiVuoto } from './documenti.js';
