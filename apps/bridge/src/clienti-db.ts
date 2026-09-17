import type { Cliente } from '@terminalinobru/core';
import { STATEMENT_PER_BLOCCO } from './catalogo-db.js';

/**
 * Persistenza dei clienti su D1 (v2). Qui non si valida nulla: la validazione dello schema sta
 * nelle rotte, questo modulo traduce clienti già validi in statement SQL. Solo l'export di
 * Easyfatt vive qui: i clienti creati in app restano sul telefono (docs/MODELLO-DATI.md sezione 2).
 */

const COLONNE_CLIENTE =
  'codice, nome, partita_iva, codice_fiscale, indirizzo, cap, citta, provincia, nazione, sdi, ' +
  'telefono, email, listino, aggiornato_il, eliminato_il';

const UPSERT_CLIENTE = `
INSERT INTO cliente (
  tenant_id, codice, nome, partita_iva, codice_fiscale, indirizzo, cap, citta, provincia,
  nazione, sdi, telefono, email, listino, aggiornato_il, eliminato_il
) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, NULL)
ON CONFLICT(tenant_id, codice) DO UPDATE SET
  nome = excluded.nome,
  partita_iva = excluded.partita_iva,
  codice_fiscale = excluded.codice_fiscale,
  indirizzo = excluded.indirizzo,
  cap = excluded.cap,
  citta = excluded.citta,
  provincia = excluded.provincia,
  nazione = excluded.nazione,
  sdi = excluded.sdi,
  telefono = excluded.telefono,
  email = excluded.email,
  listino = excluded.listino,
  aggiornato_il = excluded.aggiornato_il,
  eliminato_il = NULL`;

// Come TOMBSTONE_PRODOTTI_ASSENTI in catalogo-db.ts: tutte le righe scritte da questo invio
// portano lo stesso aggiornato_il, quindi chi non lo porta è assente dall'elenco e va eliminato.
const TOMBSTONE_CLIENTI_ASSENTI = `
UPDATE cliente SET eliminato_il = ?2, aggiornato_il = ?2
WHERE tenant_id = ?1 AND eliminato_il IS NULL AND aggiornato_il <> ?2`;

/** Converte in null i valori assenti: D1 non accetta `undefined` come parametro. */
function oNull<T>(valore: T | undefined): T | null {
  return valore === undefined ? null : valore;
}

/** Statement di inserimento o aggiornamento di un cliente. */
function statementCliente(
  db: D1Database,
  tenantId: string,
  cliente: Cliente,
  aggiornatoIl: string,
): D1PreparedStatement {
  return db
    .prepare(UPSERT_CLIENTE)
    .bind(
      tenantId,
      cliente.id,
      cliente.nome,
      oNull(cliente.partitaIva),
      oNull(cliente.codiceFiscale),
      oNull(cliente.indirizzo),
      oNull(cliente.cap),
      oNull(cliente.citta),
      oNull(cliente.provincia),
      oNull(cliente.nazione),
      oNull(cliente.sdi),
      oNull(cliente.telefono),
      oNull(cliente.email),
      oNull(cliente.listino),
      aggiornatoIl,
    );
}

/**
 * Sostituisce l'elenco clienti come un catalogo `full`: upsert a blocchi, poi tombstone di chi non
 * è arrivato in questo invio. Restituisce quanti clienti sono stati importati e quanti eliminati.
 */
export async function importaClienti(
  db: D1Database,
  tenantId: string,
  clienti: readonly Cliente[],
  aggiornatoIl: string,
): Promise<{ importati: number; eliminati: number }> {
  const statement = clienti.map((cliente) => statementCliente(db, tenantId, cliente, aggiornatoIl));
  for (let inizio = 0; inizio < statement.length; inizio += STATEMENT_PER_BLOCCO) {
    await db.batch(statement.slice(inizio, inizio + STATEMENT_PER_BLOCCO));
  }
  const tombstone = await db.prepare(TOMBSTONE_CLIENTI_ASSENTI).bind(tenantId, aggiornatoIl).run();
  await db
    .prepare('UPDATE tenant SET ultimo_clienti_il = ?2 WHERE id = ?1')
    .bind(tenantId, aggiornatoIl)
    .run();
  return { importati: clienti.length, eliminati: tombstone.meta.changes };
}

/** Riga della tabella `cliente` come arriva da D1. */
export interface RigaCliente {
  codice: string;
  nome: string;
  partita_iva: string | null;
  codice_fiscale: string | null;
  indirizzo: string | null;
  cap: string | null;
  citta: string | null;
  provincia: string | null;
  nazione: string | null;
  sdi: string | null;
  telefono: string | null;
  email: string | null;
  listino: number | null;
  aggiornato_il: string;
  eliminato_il: string | null;
}

/** Clienti del tenant non eliminati, modificati dopo `dal` se indicata. */
export async function clientiModificati(
  db: D1Database,
  tenantId: string,
  dal: string | undefined,
): Promise<RigaCliente[]> {
  const filtro = dal === undefined ? '' : ' AND aggiornato_il > ?2';
  const parametri = dal === undefined ? [tenantId] : [tenantId, dal];
  const risultato = await db
    .prepare(
      `SELECT ${COLONNE_CLIENTE} FROM cliente
       WHERE tenant_id = ?1 AND eliminato_il IS NULL${filtro}
       ORDER BY codice`,
    )
    .bind(...parametri)
    .all<RigaCliente>();
  return risultato.results;
}

/** Codici dei clienti eliminati dopo `dal`. */
export async function clientiEliminatiDopo(
  db: D1Database,
  tenantId: string,
  dal: string,
): Promise<string[]> {
  const risultato = await db
    .prepare(
      `SELECT codice FROM cliente
       WHERE tenant_id = ?1 AND eliminato_il IS NOT NULL AND eliminato_il > ?2
       ORDER BY codice`,
    )
    .bind(tenantId, dal)
    .all<{ codice: string }>();
  return risultato.results.map((riga) => riga.codice);
}

/** Converte una riga della tabella `cliente` nel tipo di dominio `Cliente`. Origine sempre `easyfatt`. */
export function rigaACliente(riga: RigaCliente): Cliente {
  return {
    id: riga.codice,
    origine: 'easyfatt',
    nome: riga.nome,
    aggiornatoIl: riga.aggiornato_il,
    ...(riga.partita_iva === null ? {} : { partitaIva: riga.partita_iva }),
    ...(riga.codice_fiscale === null ? {} : { codiceFiscale: riga.codice_fiscale }),
    ...(riga.indirizzo === null ? {} : { indirizzo: riga.indirizzo }),
    ...(riga.cap === null ? {} : { cap: riga.cap }),
    ...(riga.citta === null ? {} : { citta: riga.citta }),
    ...(riga.provincia === null ? {} : { provincia: riga.provincia }),
    ...(riga.nazione === null ? {} : { nazione: riga.nazione }),
    ...(riga.sdi === null ? {} : { sdi: riga.sdi }),
    ...(riga.telefono === null ? {} : { telefono: riga.telefono }),
    ...(riga.email === null ? {} : { email: riga.email }),
    ...(riga.listino === null ? {} : { listino: riga.listino }),
    ...(riga.eliminato_il === null ? {} : { eliminatoIl: riga.eliminato_il }),
  };
}
