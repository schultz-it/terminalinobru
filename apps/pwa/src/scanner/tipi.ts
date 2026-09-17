/** Da dove arriva un codice letto dallo scanner. */
export type SorgenteLettura = 'fotocamera' | 'lettore' | 'manuale';

/**
 * Esito che chi riceve il codice restituisce allo scanner, per scegliere il feedback:
 * `trovato` suono di conferma, `sconosciuto` suono di errore, `ignorato` nessun feedback.
 */
export type EsitoLettura = 'trovato' | 'sconosciuto' | 'ignorato';
