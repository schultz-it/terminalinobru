import { schemaClienteDocumento, type ClienteDocumento } from './tipi.js';

/** Campo del cliente che può avere un errore di validazione. */
export type CampoCliente = keyof ClienteDocumento;

/** Dati del cliente come arrivano da un modulo: stringhe facoltative, anche vuote. */
export type DatiCliente = Partial<Record<CampoCliente, string>>;

/** Esito di {@link validaCliente}: il cliente pulito oppure un messaggio per ogni campo errato. */
export type EsitoValidazioneCliente =
  | { valido: true; cliente: ClienteDocumento }
  | { valido: false; errori: Partial<Record<CampoCliente, string>> };

/** Campi scritti in maiuscolo dopo la pulizia. */
const CAMPI_MAIUSCOLI: readonly CampoCliente[] = ['partitaIva', 'codiceFiscale', 'provincia'];

/**
 * Pulisce e valida i dati di un cliente: toglie gli spazi ai bordi, considera assenti i campi
 * vuoti, porta in maiuscolo partita IVA, codice fiscale, provincia e codice destinatario (non la PEC).
 * I messaggi di errore sono in italiano, uno per campo.
 */
export function validaCliente(dati: DatiCliente): EsitoValidazioneCliente {
  const pulito: DatiCliente = {};
  for (const [campo, valore] of Object.entries(dati) as [CampoCliente, string | undefined][]) {
    const testo = valore?.trim();
    if (testo === undefined || testo === '') continue;
    const maiuscolo = CAMPI_MAIUSCOLI.includes(campo) || (campo === 'sdi' && !testo.includes('@'));
    pulito[campo] = maiuscolo ? testo.toUpperCase() : testo;
  }
  const esito = schemaClienteDocumento.safeParse(pulito);
  if (esito.success) return { valido: true, cliente: esito.data };
  const errori: Partial<Record<CampoCliente, string>> = {};
  for (const problema of esito.error.issues) {
    const campo = problema.path[0] as CampoCliente;
    errori[campo] ??= problema.message;
  }
  return { valido: false, errori };
}
