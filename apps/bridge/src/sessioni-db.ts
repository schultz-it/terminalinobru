import type { ModalitaScansione, Riga, TipoSessione } from '@terminalinobru/core';
import { STATEMENT_PER_BLOCCO } from './catalogo-db.js';

/**
 * Persistenza delle sessioni chiuse su D1. Qui non si valida nulla: la validazione dello schema
 * sta nelle rotte, questo modulo traduce sessioni già valide in statement SQL.
 */

const COLONNE_SESSIONE =
  'id, tipo, nome, note, stato, modalita, dispositivo, creata_il, chiusa_il, ricevuta_il, esportata_il, importata_il';

const COLONNE_RIGA = 'id, sessione_id, codice_prodotto, quantita, barcode_letto, letta_il, ordine';

// L'upsert è per `id`, chiave globale della sessione generata sul telefono. `ricevuta_il` non
// compare nel SET: resta quella dell'invio originale anche quando la sessione viene risostituita.
// Riaprire e richiudere sul telefono riporta lo stato a "chiusa" e azzera le date di export/import.
const UPSERT_SESSIONE = `
INSERT INTO sessione (
  id, tenant_id, tipo, nome, note, stato, modalita, dispositivo, creata_il, chiusa_il, ricevuta_il,
  esportata_il, importata_il
) VALUES (?1, ?2, ?3, ?4, ?5, 'chiusa', ?6, ?7, ?8, ?9, ?10, NULL, NULL)
ON CONFLICT(id) DO UPDATE SET
  tipo = excluded.tipo,
  nome = excluded.nome,
  note = excluded.note,
  stato = 'chiusa',
  modalita = excluded.modalita,
  dispositivo = excluded.dispositivo,
  creata_il = excluded.creata_il,
  chiusa_il = excluded.chiusa_il,
  esportata_il = NULL,
  importata_il = NULL
RETURNING ricevuta_il`;

const ELIMINA_RIGHE = 'DELETE FROM riga WHERE sessione_id = ?1';

const INSERISCI_RIGA = `
INSERT INTO riga (id, sessione_id, codice_prodotto, quantita, barcode_letto, letta_il, ordine)
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`;

/** Converte in null i valori assenti: D1 non accetta `undefined` come parametro. */
function oNull<T>(valore: T | undefined): T | null {
  return valore === undefined ? null : valore;
}

/** Sessione già validata, pronta per essere scritta su D1. */
export interface SessioneDaSalvare {
  id: string;
  tipo: TipoSessione;
  nome: string;
  note?: string;
  modalita: ModalitaScansione;
  dispositivo?: string;
  creataIl: string;
  chiusaIl: string;
  righe: readonly Riga[];
}

/** Riga della tabella `sessione` come arriva da D1. */
export interface RigaSessioneDb {
  id: string;
  tipo: TipoSessione;
  nome: string;
  note: string | null;
  stato: 'chiusa' | 'esportata' | 'importata';
  modalita: ModalitaScansione;
  dispositivo: string | null;
  creata_il: string;
  chiusa_il: string;
  ricevuta_il: string;
  esportata_il: string | null;
  importata_il: string | null;
}

/** Riga della tabella `sessione` con il conteggio e la somma delle righe, per l'elenco. */
export interface RigaSessioneConteggioDb extends RigaSessioneDb {
  conteggio_righe: number;
  somma_quantita: number;
}

/** Riga della tabella `riga` come arriva da D1. */
export interface RigaRigaDb {
  id: string;
  sessione_id: string;
  codice_prodotto: string;
  quantita: number;
  barcode_letto: string | null;
  letta_il: string;
  ordine: number;
}

/** Sessione senza righe, con le date del bridge (`ricevutaIl`, `esportataIl`, `importataIl`). */
export interface SessioneSommario {
  id: string;
  tipo: TipoSessione;
  nome: string;
  note?: string;
  stato: 'chiusa' | 'esportata' | 'importata';
  modalita: ModalitaScansione;
  dispositivo?: string;
  creataIl: string;
  chiusaIl: string;
  ricevutaIl: string;
  esportataIl?: string;
  importataIl?: string;
}

/** Sessione dell'elenco, con conteggio e somma delle quantità. */
export interface SessioneConteggio extends SessioneSommario {
  conteggioRighe: number;
  sommaQuantita: number;
}

/** Sessione con le righe in ordine, per il dettaglio. */
export interface SessioneDettaglio extends SessioneSommario {
  righe: Riga[];
}

/** Converte una riga `sessione` nella forma di dominio, senza righe. */
function rigaASommario(riga: RigaSessioneDb): SessioneSommario {
  return {
    id: riga.id,
    tipo: riga.tipo,
    stato: riga.stato,
    nome: riga.nome,
    modalita: riga.modalita,
    creataIl: riga.creata_il,
    chiusaIl: riga.chiusa_il,
    ricevutaIl: riga.ricevuta_il,
    ...(riga.note === null ? {} : { note: riga.note }),
    ...(riga.dispositivo === null ? {} : { dispositivo: riga.dispositivo }),
    ...(riga.esportata_il === null ? {} : { esportataIl: riga.esportata_il }),
    ...(riga.importata_il === null ? {} : { importataIl: riga.importata_il }),
  };
}

/** Converte una riga `riga` nel tipo di dominio `Riga`. */
function rigaARiga(riga: RigaRigaDb): Riga {
  return {
    id: riga.id,
    sessioneId: riga.sessione_id,
    codiceProdotto: riga.codice_prodotto,
    quantita: riga.quantita,
    lettaIl: riga.letta_il,
    ordine: riga.ordine,
    ...(riga.barcode_letto === null ? {} : { barcodeLetto: riga.barcode_letto }),
  };
}

/**
 * Upsert per `id`: crea la sessione oppure sostituisce campi e righe di una già ricevuta.
 * Restituisce `ricevutaIl`, che resta quella del primo invio anche quando si sostituisce.
 */
export async function upsertSessione(
  db: D1Database,
  tenantId: string,
  sessione: SessioneDaSalvare,
  adesso: string,
): Promise<string> {
  const statement = [
    db
      .prepare(UPSERT_SESSIONE)
      .bind(
        sessione.id,
        tenantId,
        sessione.tipo,
        sessione.nome,
        oNull(sessione.note),
        sessione.modalita,
        oNull(sessione.dispositivo),
        sessione.creataIl,
        sessione.chiusaIl,
        adesso,
      ),
    db.prepare(ELIMINA_RIGHE).bind(sessione.id),
    ...sessione.righe.map((riga) =>
      db
        .prepare(INSERISCI_RIGA)
        .bind(
          riga.id,
          sessione.id,
          riga.codiceProdotto,
          riga.quantita,
          oNull(riga.barcodeLetto),
          riga.lettaIl,
          riga.ordine,
        ),
    ),
  ];

  let ricevutaIl = adesso;
  for (let inizio = 0; inizio < statement.length; inizio += STATEMENT_PER_BLOCCO) {
    const blocco = await db.batch(statement.slice(inizio, inizio + STATEMENT_PER_BLOCCO));
    if (inizio === 0) {
      const primaRiga = blocco[0]?.results[0] as { ricevuta_il: string } | undefined;
      ricevutaIl = primaRiga?.ricevuta_il ?? adesso;
    }
  }
  return ricevutaIl;
}

/** Elenco delle sessioni del tenant, senza righe, con conteggio e somma delle quantità. */
export async function elencoSessioni(
  db: D1Database,
  tenantId: string,
  stato?: string,
): Promise<SessioneConteggio[]> {
  const filtro = stato === undefined ? '' : ' AND s.stato = ?2';
  const parametri = stato === undefined ? [tenantId] : [tenantId, stato];
  const risultato = await db
    .prepare(
      `SELECT s.id, s.tipo, s.nome, s.note, s.stato, s.modalita, s.dispositivo, s.creata_il,
              s.chiusa_il, s.ricevuta_il, s.esportata_il, s.importata_il,
              COUNT(r.id) AS conteggio_righe, COALESCE(SUM(r.quantita), 0) AS somma_quantita
       FROM sessione s
       LEFT JOIN riga r ON r.sessione_id = s.id
       WHERE s.tenant_id = ?1${filtro}
       GROUP BY s.id
       ORDER BY s.chiusa_il DESC`,
    )
    .bind(...parametri)
    .all<RigaSessioneConteggioDb>();
  return risultato.results.map((riga) => ({
    ...rigaASommario(riga),
    conteggioRighe: riga.conteggio_righe,
    sommaQuantita: riga.somma_quantita,
  }));
}

/** Sessione del tenant senza righe, o `null` se non esiste o è di un altro tenant. */
export async function recuperaSessioneBase(
  db: D1Database,
  tenantId: string,
  id: string,
): Promise<SessioneSommario | null> {
  const riga = await db
    .prepare(`SELECT ${COLONNE_SESSIONE} FROM sessione WHERE id = ?1 AND tenant_id = ?2`)
    .bind(id, tenantId)
    .first<RigaSessioneDb>();
  return riga === null ? null : rigaASommario(riga);
}

/** Sessione del tenant con le righe in ordine, o `null` se non esiste o è di un altro tenant. */
export async function recuperaSessioneConRighe(
  db: D1Database,
  tenantId: string,
  id: string,
): Promise<SessioneDettaglio | null> {
  const base = await recuperaSessioneBase(db, tenantId, id);
  if (base === null) return null;
  const righe = await db
    .prepare(`SELECT ${COLONNE_RIGA} FROM riga WHERE sessione_id = ?1 ORDER BY ordine`)
    .bind(id)
    .all<RigaRigaDb>();
  return { ...base, righe: righe.results.map(rigaARiga) };
}

/** Imposta lo stato della sessione e la data di esportazione o importazione. */
export async function impostaStato(
  db: D1Database,
  tenantId: string,
  id: string,
  nuovoStato: 'esportata' | 'importata',
  adesso: string,
): Promise<SessioneSommario | null> {
  const colonnaData = nuovoStato === 'esportata' ? 'esportata_il' : 'importata_il';
  const riga = await db
    .prepare(
      `UPDATE sessione SET stato = ?3, ${colonnaData} = ?4
       WHERE id = ?1 AND tenant_id = ?2
       RETURNING ${COLONNE_SESSIONE}`,
    )
    .bind(id, tenantId, nuovoStato, adesso)
    .first<RigaSessioneDb>();
  return riga === null ? null : rigaASommario(riga);
}
