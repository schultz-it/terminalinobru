import { prezziVuoti } from '@terminalinobru/core';
import type { Barcode, Prezzo, Prodotto } from '@terminalinobru/core';
import type { Catalogo } from '@terminalinobru/easyfatt';

/**
 * Persistenza del catalogo su D1. Qui non si analizza nulla: il parsing sta in
 * `packages/easyfatt`, questo modulo traduce il risultato in statement SQL.
 */

/** Numero massimo di statement per ogni chiamata a `db.batch` (limite pratico di D1). */
export const STATEMENT_PER_BLOCCO = 50;

/**
 * D1 accetta al massimo 100 parametri legati per statement: le query con `IN (...)` vanno
 * spezzate in blocchi di questa misura, lasciando spazio ai parametri fissi (tenant, date).
 */
export const PARAMETRI_PER_QUERY = 90;

/** Spezza un elenco in blocchi di al più `PARAMETRI_PER_QUERY` elementi, per le query `IN (...)`. */
export function aBlocchi<T>(elementi: readonly T[]): T[][] {
  const blocchi: T[][] = [];
  for (let inizio = 0; inizio < elementi.length; inizio += PARAMETRI_PER_QUERY) {
    blocchi.push(elementi.slice(inizio, inizio + PARAMETRI_PER_QUERY));
  }
  return blocchi;
}

const INSERISCI_PRODOTTO = `
INSERT INTO prodotto (
  tenant_id, codice, descrizione, categoria, sottocategoria, um,
  prezzi_netti, prezzi_lordi, iva_perc, gestione_magazzino,
  ubicazione, scorta_minima, giacenza, ordinato,
  fornitore, codice_fornitore, note, aggiornato_il, eliminato_il
) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, NULL)
ON CONFLICT(tenant_id, codice) DO UPDATE SET
  descrizione = excluded.descrizione,
  categoria = excluded.categoria,
  sottocategoria = excluded.sottocategoria,
  um = excluded.um,
  prezzi_netti = excluded.prezzi_netti,
  prezzi_lordi = excluded.prezzi_lordi,
  iva_perc = excluded.iva_perc,
  gestione_magazzino = excluded.gestione_magazzino,
  ubicazione = excluded.ubicazione,
  scorta_minima = excluded.scorta_minima,
  giacenza = excluded.giacenza,
  ordinato = excluded.ordinato,
  fornitore = excluded.fornitore,
  codice_fornitore = excluded.codice_fornitore,
  note = excluded.note,
  aggiornato_il = excluded.aggiornato_il,
  eliminato_il = NULL`;

// Un barcode già presente con origine 'app' resta, ma passa a origine 'easyfatt': da quel momento
// è Easyfatt a possederlo e a poterlo eliminare.
const INSERISCI_BARCODE = `
INSERT INTO barcode (
  tenant_id, barcode, codice_prodotto, origine, quantita_confezione, aggiornato_il, eliminato_il
) VALUES (?1, ?2, ?3, 'easyfatt', ?4, ?5, NULL)
ON CONFLICT(tenant_id, barcode) DO UPDATE SET
  codice_prodotto = excluded.codice_prodotto,
  origine = 'easyfatt',
  quantita_confezione = excluded.quantita_confezione,
  aggiornato_il = excluded.aggiornato_il,
  eliminato_il = NULL`;

// In modalità full ciò che non è stato toccato da questo invio non c'è più. Il marcatore è
// `aggiornato_il`: tutte le righe scritte da questo invio portano lo stesso istante.
const TOMBSTONE_PRODOTTI_ASSENTI = `
UPDATE prodotto SET eliminato_il = ?2, aggiornato_il = ?2
WHERE tenant_id = ?1 AND eliminato_il IS NULL AND aggiornato_il <> ?2`;

const TOMBSTONE_BARCODE_ASSENTI = `
UPDATE barcode SET eliminato_il = ?2, aggiornato_il = ?2
WHERE tenant_id = ?1 AND eliminato_il IS NULL AND origine = 'easyfatt' AND aggiornato_il <> ?2`;

const TOMBSTONE_PRODOTTO = `
UPDATE prodotto SET eliminato_il = ?3, aggiornato_il = ?3
WHERE tenant_id = ?1 AND codice = ?2 AND eliminato_il IS NULL`;

const TOMBSTONE_BARCODE_DI_PRODOTTO = `
UPDATE barcode SET eliminato_il = ?3, aggiornato_il = ?3
WHERE tenant_id = ?1 AND codice_prodotto = ?2 AND origine = 'easyfatt' AND eliminato_il IS NULL`;

/** Converte in null i valori assenti: D1 non accetta `undefined` come parametro. */
function oNull<T>(valore: T | undefined): T | null {
  return valore === undefined ? null : valore;
}

/** Statement di inserimento o aggiornamento di un prodotto. */
function statementProdotto(
  db: D1Database,
  tenantId: string,
  prodotto: Prodotto,
  aggiornatoIl: string,
): D1PreparedStatement {
  return db
    .prepare(INSERISCI_PRODOTTO)
    .bind(
      tenantId,
      prodotto.codice,
      prodotto.descrizione,
      oNull(prodotto.categoria),
      oNull(prodotto.sottocategoria),
      oNull(prodotto.um),
      JSON.stringify(prodotto.prezziNetti),
      JSON.stringify(prodotto.prezziLordi),
      oNull(prodotto.ivaPerc),
      prodotto.gestioneMagazzino ? 1 : 0,
      oNull(prodotto.ubicazione),
      oNull(prodotto.scortaMinima),
      oNull(prodotto.giacenza),
      oNull(prodotto.ordinato),
      oNull(prodotto.fornitore),
      oNull(prodotto.codiceFornitore),
      oNull(prodotto.note),
      aggiornatoIl,
    );
}

/** Statement di inserimento o aggiornamento di un abbinamento barcode. */
function statementBarcode(
  db: D1Database,
  tenantId: string,
  barcode: Barcode,
  aggiornatoIl: string,
): D1PreparedStatement {
  return db
    .prepare(INSERISCI_BARCODE)
    .bind(
      tenantId,
      barcode.barcode,
      barcode.codiceProdotto,
      oNull(barcode.quantitaConfezione),
      aggiornatoIl,
    );
}

/**
 * Sceglie l'istante da scrivere in `aggiornato_il`: deve essere posteriore all'ultimo invio, così
 * nessuna riga già presente porta per caso lo stesso istante e i tombstone restano affidabili.
 */
export function istanteInvio(adesso: string, ultimoCatalogoIl: string | null): string {
  if (ultimoCatalogoIl === null) return adesso;
  const precedente = Date.parse(ultimoCatalogoIl);
  if (Number.isNaN(precedente)) return adesso;
  if (Date.parse(adesso) > precedente) return adesso;
  return new Date(precedente + 1).toISOString();
}

/** Costruisce, nell'ordine di esecuzione, tutti gli statement di un invio del catalogo. */
export function statementCatalogo(
  db: D1Database,
  tenantId: string,
  catalogo: Catalogo,
  aggiornatoIl: string,
): D1PreparedStatement[] {
  const statement: D1PreparedStatement[] = [];
  for (const prodotto of catalogo.prodotti) {
    statement.push(statementProdotto(db, tenantId, prodotto, aggiornatoIl));
  }
  for (const barcode of catalogo.barcode) {
    statement.push(statementBarcode(db, tenantId, barcode, aggiornatoIl));
  }
  if (catalogo.modalita === 'full') {
    statement.push(db.prepare(TOMBSTONE_PRODOTTI_ASSENTI).bind(tenantId, aggiornatoIl));
    statement.push(db.prepare(TOMBSTONE_BARCODE_ASSENTI).bind(tenantId, aggiornatoIl));
  } else {
    for (const codice of catalogo.codiciEliminati) {
      statement.push(db.prepare(TOMBSTONE_PRODOTTO).bind(tenantId, codice, aggiornatoIl));
      statement.push(
        db.prepare(TOMBSTONE_BARCODE_DI_PRODOTTO).bind(tenantId, codice, aggiornatoIl),
      );
    }
  }
  return statement;
}

/**
 * Salva il catalogo a blocchi di `STATEMENT_PER_BLOCCO` statement. Ogni blocco è atomico in D1;
 * `ultimo_catalogo_il` viene scritto solo alla fine e fa da marcatore di invio riuscito: se un
 * blocco fallisce l'eccezione risale e il tenant resta con la data dell'invio precedente.
 */
export async function salvaCatalogo(
  db: D1Database,
  tenantId: string,
  catalogo: Catalogo,
  aggiornatoIl: string,
): Promise<void> {
  const statement = statementCatalogo(db, tenantId, catalogo, aggiornatoIl);
  for (let inizio = 0; inizio < statement.length; inizio += STATEMENT_PER_BLOCCO) {
    await db.batch(statement.slice(inizio, inizio + STATEMENT_PER_BLOCCO));
  }
  await db
    .prepare('UPDATE tenant SET ultimo_catalogo_il = ?2 WHERE id = ?1')
    .bind(tenantId, aggiornatoIl)
    .run();
}

/**
 * Descrizione dei prodotti indicati, per codice. Usata dalla ricezione documenti (v2), che riceve
 * dalle sessioni solo il codice e deve completare la riga con la descrizione dal catalogo.
 */
export async function descrizioniProdotti(
  db: D1Database,
  tenantId: string,
  codici: readonly string[],
): Promise<Map<string, string>> {
  const descrizioni = new Map<string, string>();
  for (const blocco of aBlocchi([...new Set(codici)])) {
    const segnaposto = blocco.map((_, indice) => `?${indice + 2}`).join(', ');
    const risultato = await db
      .prepare(
        `SELECT codice, descrizione FROM prodotto WHERE tenant_id = ?1 AND codice IN (${segnaposto})`,
      )
      .bind(tenantId, ...blocco)
      .all<{ codice: string; descrizione: string }>();
    for (const riga of risultato.results) descrizioni.set(riga.codice, riga.descrizione);
  }
  return descrizioni;
}

/** Riga della tabella `prodotto` come arriva da D1. */
export interface RigaProdotto {
  codice: string;
  descrizione: string;
  categoria: string | null;
  sottocategoria: string | null;
  um: string | null;
  prezzi_netti: string;
  prezzi_lordi: string;
  iva_perc: number | null;
  gestione_magazzino: number;
  ubicazione: string | null;
  scorta_minima: number | null;
  giacenza: number | null;
  ordinato: number | null;
  fornitore: string | null;
  codice_fornitore: string | null;
  note: string | null;
  aggiornato_il: string;
  eliminato_il: string | null;
}

/** Riga della tabella `barcode` come arriva da D1. */
export interface RigaBarcode {
  barcode: string;
  codice_prodotto: string;
  origine: 'easyfatt' | 'app';
  quantita_confezione: number | null;
  aggiornato_il: string;
}

/** Legge un array di listini salvato come JSON, con nove valori anche se il testo è rovinato. */
function listini(json: string): Prezzo[] {
  try {
    const valore: unknown = JSON.parse(json);
    if (Array.isArray(valore)) {
      return valore.map((prezzo) => (typeof prezzo === 'number' ? prezzo : null));
    }
  } catch {
    // Testo non interpretabile: si risponde con listini assenti invece di rompere la sincronia.
  }
  return prezziVuoti();
}

/** Converte una riga della tabella `prodotto` nel tipo di dominio `Prodotto`. */
export function rigaAProdotto(riga: RigaProdotto): Prodotto {
  return {
    codice: riga.codice,
    descrizione: riga.descrizione,
    prezziNetti: listini(riga.prezzi_netti),
    prezziLordi: listini(riga.prezzi_lordi),
    gestioneMagazzino: riga.gestione_magazzino !== 0,
    aggiornatoIl: riga.aggiornato_il,
    ...(riga.categoria === null ? {} : { categoria: riga.categoria }),
    ...(riga.sottocategoria === null ? {} : { sottocategoria: riga.sottocategoria }),
    ...(riga.um === null ? {} : { um: riga.um }),
    ...(riga.iva_perc === null ? {} : { ivaPerc: riga.iva_perc }),
    ...(riga.ubicazione === null ? {} : { ubicazione: riga.ubicazione }),
    ...(riga.scorta_minima === null ? {} : { scortaMinima: riga.scorta_minima }),
    ...(riga.giacenza === null ? {} : { giacenza: riga.giacenza }),
    ...(riga.ordinato === null ? {} : { ordinato: riga.ordinato }),
    ...(riga.fornitore === null ? {} : { fornitore: riga.fornitore }),
    ...(riga.codice_fornitore === null ? {} : { codiceFornitore: riga.codice_fornitore }),
    ...(riga.note === null ? {} : { note: riga.note }),
    ...(riga.eliminato_il === null ? {} : { eliminatoIl: riga.eliminato_il }),
  };
}

/** Converte una riga della tabella `barcode` nel tipo di dominio `Barcode`. */
export function rigaABarcode(riga: RigaBarcode): Barcode {
  return {
    barcode: riga.barcode,
    codiceProdotto: riga.codice_prodotto,
    origine: riga.origine,
    aggiornatoIl: riga.aggiornato_il,
    ...(riga.quantita_confezione === null ? {} : { quantitaConfezione: riga.quantita_confezione }),
  };
}
