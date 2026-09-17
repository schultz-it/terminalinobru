import { STATEMENT_PER_BLOCCO } from './catalogo-db.js';

/**
 * Persistenza degli abbinamenti barcode creati in app. Qui non si valida nulla: la validazione
 * sta nelle rotte, questo modulo traduce abbinamenti già validi in statement SQL.
 */

/** Abbinamento barcode → codice prodotto creato in app, non ancora scritto su D1. */
export interface AbbinamentoDaSalvare {
  barcode: string;
  codiceProdotto: string;
}

/** Riga della tabella `barcode` con solo le colonne del CSV dei nuovi abbinamenti. */
export interface RigaBarcodeNuovoDb {
  barcode: string;
  codice_prodotto: string;
}

// Un abbinamento con origine 'easyfatt' non viene mai toccato dall'app: la clausola WHERE dopo
// DO UPDATE SET rende l'upsert un no-op in quel caso, lasciando la riga di Easyfatt intatta.
const UPSERT_BARCODE_APP = `
INSERT INTO barcode (tenant_id, barcode, codice_prodotto, origine, quantita_confezione, aggiornato_il, eliminato_il)
VALUES (?1, ?2, ?3, 'app', NULL, ?4, NULL)
ON CONFLICT(tenant_id, barcode) DO UPDATE SET
  codice_prodotto = excluded.codice_prodotto,
  aggiornato_il = excluded.aggiornato_il,
  eliminato_il = NULL
WHERE barcode.origine <> 'easyfatt'`;

/**
 * Upsert degli abbinamenti con origine 'app'. Chi ha già origine 'easyfatt' resta invariato.
 */
export async function salvaAbbinamentiApp(
  db: D1Database,
  tenantId: string,
  abbinamenti: readonly AbbinamentoDaSalvare[],
  adesso: string,
): Promise<void> {
  const statement = abbinamenti.map((abbinamento) =>
    db
      .prepare(UPSERT_BARCODE_APP)
      .bind(tenantId, abbinamento.barcode, abbinamento.codiceProdotto, adesso),
  );
  for (let inizio = 0; inizio < statement.length; inizio += STATEMENT_PER_BLOCCO) {
    await db.batch(statement.slice(inizio, inizio + STATEMENT_PER_BLOCCO));
  }
}

/** Abbinamenti con origine 'app', da riportare in Easyfatt. */
export async function abbinamentiApp(
  db: D1Database,
  tenantId: string,
): Promise<RigaBarcodeNuovoDb[]> {
  const risultato = await db
    .prepare(
      `SELECT barcode, codice_prodotto FROM barcode
       WHERE tenant_id = ?1 AND origine = 'app' AND eliminato_il IS NULL
       ORDER BY codice_prodotto, barcode`,
    )
    .bind(tenantId)
    .all<RigaBarcodeNuovoDb>();
  return risultato.results;
}
