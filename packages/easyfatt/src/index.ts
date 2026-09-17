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

/** Genera l'`EasyfattDocuments` con gli ordini cliente (`DocumentType` C) per la ricezione e-commerce. */
export { generaDocumentiXml } from './documenti.js';
/** Genera l'`EasyfattDocuments` vuoto, come `generaDocumentiXml([])`. */
export { generaDocumentiVuoto } from './documenti.js';
/** Quantità con punto decimale, al massimo 3 decimali e senza zeri inutili. */
export { formattaQuantita } from './documenti.js';
/** Errore di generazione dei documenti, con messaggio in italiano. */
export { ErroreDocumenti } from './documenti.js';
export type { DocumentoOrdine, OpzioniDocumenti, RigaDocumento } from './documenti.js';

/** Interpreta i parametri `appver`, `firstdate`, `lastdate`, `firstnum`, `lastnum` del polling. */
export { analizzaParametriRicezione } from './ricezione.js';
/** Errore nei parametri del polling, con messaggio in italiano. */
export { ErroreRicezione } from './ricezione.js';
export type { ParametriRicezione } from './ricezione.js';

/** Legge l'export clienti di Easyfatt salvato come CSV. */
export { analizzaClientiCsv } from './clienti-csv.js';
/** Errore che rende inutilizzabile l'export clienti, con messaggio in italiano. */
export { ErroreClientiCsv } from './clienti-csv.js';
export type { ClientiCsv, OpzioniClientiCsv } from './clienti-csv.js';
