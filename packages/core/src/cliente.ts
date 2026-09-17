import { schemaClienteDocumento, type Cliente, type ClienteDocumento } from './tipi.js';

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

/** Campi che finiscono nel documento, nell'ordine dello schema. */
const CAMPI_DOCUMENTO = Object.keys(schemaClienteDocumento.shape) as CampoCliente[];

/**
 * Copia dei campi di un'anagrafica che viaggiano nella sessione e finiscono nel documento
 * (`Sessione.cliente`): restano fuori id, origine, listino e date, che servono solo al telefono.
 * Per un cliente di Easyfatt l'id è il suo codice (docs/MODELLO-DATI.md sezione 1): se il campo
 * `codice` manca, lo si ricava dall'id, così il documento porta `CustomerCode`.
 */
export function clienteDocumento(cliente: Cliente): ClienteDocumento {
  const documento: ClienteDocumento = { nome: cliente.nome };
  for (const campo of CAMPI_DOCUMENTO) {
    const valore = cliente[campo];
    if (valore !== undefined) documento[campo] = valore;
  }
  if (documento.codice === undefined && cliente.origine === 'easyfatt') {
    return { codice: cliente.id, ...documento };
  }
  return documento;
}

/** Campo scartato da {@link ripulisciCliente}: nome, valore originale e motivo. */
export type CampoScartato = { campo: CampoCliente; valore: string; messaggio: string };

/**
 * Toglie da un'anagrafica i campi facoltativi che non rispettano lo schema, invece di rifiutare
 * l'intero cliente: l'export di Easyfatt contiene dati scritti a mano (provincia per esteso, email
 * incomplete, codici destinatario troncati) e un solo campo sporco non deve bloccare l'importazione
 * di tutto l'elenco. Il nome, obbligatorio, non viene toccato. Vedi docs/DECISIONI.md punto 65.
 */
export function ripulisciCliente(cliente: Cliente): {
  cliente: Cliente;
  scartati: CampoScartato[];
} {
  const pulito: Cliente = { ...cliente };
  const scartati: CampoScartato[] = [];
  for (const campo of CAMPI_DOCUMENTO) {
    const valore = pulito[campo];
    if (campo === 'nome' || valore === undefined) continue;
    const esito = schemaClienteDocumento.shape[campo].safeParse(valore);
    if (esito.success) continue;
    delete pulito[campo];
    scartati.push({
      campo,
      valore,
      messaggio: esito.error.issues[0]?.message ?? 'Valore non valido.',
    });
  }
  return { cliente: pulito, scartati };
}
