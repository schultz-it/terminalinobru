/**
 * Tipi di dominio, schemi zod e funzioni pure condivise da bridge e PWA.
 * Vedi docs/MODELLO-DATI.md sezione 1.
 */

/** Numero di listini gestiti da Easyfatt (1..9). */
export { NUMERO_LISTINI } from './tipi.js';
/** Array di listini tutti assenti (null), da usare come valore di default. */
export { prezziVuoti } from './tipi.js';
/** Impostazioni di partenza dell'app, con `stringaFormato` 'A,Q'. */
export { IMPOSTAZIONI_DEFAULT } from './tipi.js';
/** Fine riga predefinita del file terminalino (`\r\n`). */
export { FINE_RIGA_DEFAULT } from './tipi.js';
export {
  schemaBarcode,
  schemaCliente,
  schemaClienteDocumento,
  schemaImpostazioni,
  schemaModalitaScansione,
  schemaOrigineBarcode,
  schemaOrigineCliente,
  schemaProdotto,
  schemaRiga,
  schemaSessione,
  schemaStatoSessione,
  schemaTipoSessione,
} from './tipi.js';
export type {
  Barcode,
  Cliente,
  ClienteDocumento,
  Impostazioni,
  ModalitaScansione,
  OrigineBarcode,
  OrigineCliente,
  Prezzo,
  Prodotto,
  Riga,
  Sessione,
  StatoSessione,
  TipoSessione,
} from './tipi.js';

/** Pulisce e valida i dati di un cliente, con un messaggio in italiano per ogni campo errato. */
export { validaCliente } from './cliente.js';
export type { CampoCliente, DatiCliente, EsitoValidazioneCliente } from './cliente.js';

/** Somma le quantità per codice prodotto, nell'ordine di prima comparsa. */
export { aggregaRighe } from './aggrega.js';
/** Arrotonda una quantità ai 3 decimali ammessi dal file terminalino. */
export { arrotondaQuantita } from './aggrega.js';
export type { QuantitaPerCodice, RigaAggregabile } from './aggrega.js';

/** Minuscolo, senza accenti, spazi compressi: forma di confronto per la ricerca. */
export { normalizza } from './ricerca.js';
/** Costruisce l'indice di ricerca dai prodotti non eliminati. */
export { costruisciIndice } from './ricerca.js';
/** Cerca nell'indice in AND sui token della query, con priorità ai prefissi di codice. */
export { cercaProdotti } from './ricerca.js';
/** Limite di risultati usato quando il chiamante non ne indica uno. */
export { LIMITE_RICERCA_DEFAULT } from './ricerca.js';
export type { IndiceRicerca, VoceIndice } from './ricerca.js';

/** Dice se il passaggio di stato `da → a` di una sessione è ammesso. */
export { transizioneStato } from './stato.js';
/** Mappa delle transizioni di stato ammesse, riapertura inclusa. */
export { TRANSIZIONI_AMMESSE } from './stato.js';

/** Riconosce una raffica di tasti del lettore terminata da Invio e ne restituisce il codice. */
export { rilevaInputLettore } from './lettore.js';
/** Soglia predefinita fra due tasti della stessa raffica (50 ms). */
export { SOGLIA_RAFFICA_MS } from './lettore.js';
/** Lunghezza minima predefinita di un codice letto (3 caratteri). */
export { LUNGHEZZA_MINIMA_CODICE } from './lettore.js';
export type { EventoTasto, OpzioniLettore } from './lettore.js';
