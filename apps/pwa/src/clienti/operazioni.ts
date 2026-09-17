import {
  validaCliente,
  type CampoCliente,
  type Cliente,
  type DatiCliente,
} from '@terminalinobru/core';
import type { DatabaseTerminalino } from '../db.js';
import { generaUuid } from '../sessioni/modello.js';

/** Campi del modulo "Nuovo cliente", nell'ordine in cui compaiono. */
export const CAMPI_NUOVO_CLIENTE = [
  'nome',
  'partitaIva',
  'codiceFiscale',
  'indirizzo',
  'cap',
  'citta',
  'provincia',
  'sdi',
  'telefono',
  'email',
] as const satisfies readonly CampoCliente[];

/** Campo del modulo "Nuovo cliente". */
export type CampoNuovoCliente = (typeof CAMPI_NUOVO_CLIENTE)[number];

/** Esito della creazione: il cliente salvato oppure un messaggio per ogni campo errato. */
export type EsitoNuovoCliente =
  { ok: true; cliente: Cliente } | { ok: false; errori: Partial<Record<CampoCliente, string>> };

/**
 * Crea sul telefono un cliente che Easyfatt non conosce ancora: validato con `validaCliente`,
 * `origine: 'app'` e un UUID come id. Il codice non si chiede: lo assegna Easyfatt quando crea
 * l'anagrafica al primo scarico del documento (docs/DECISIONI.md punto 56).
 */
export async function creaClienteApp(
  db: DatabaseTerminalino,
  dati: Pick<DatiCliente, CampoNuovoCliente>,
  adesso: Date = new Date(),
  generaId: () => string = generaUuid,
): Promise<EsitoNuovoCliente> {
  const soloModulo: DatiCliente = {};
  for (const campo of CAMPI_NUOVO_CLIENTE) {
    const valore = dati[campo];
    if (valore !== undefined) soloModulo[campo] = valore;
  }
  const esito = validaCliente(soloModulo);
  if (!esito.valido) return { ok: false, errori: esito.errori };
  const cliente: Cliente = {
    ...esito.cliente,
    id: generaId(),
    origine: 'app',
    aggiornatoIl: adesso.toISOString(),
  };
  await db.clienti.add(cliente);
  return { ok: true, cliente };
}
