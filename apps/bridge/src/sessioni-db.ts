import type { ClienteDocumento, ModalitaScansione, Riga, TipoSessione } from '@terminalinobru/core';
import { STATEMENT_PER_BLOCCO } from './catalogo-db.js';

/**
 * Persistenza delle sessioni chiuse su D1. Qui non si valida nulla: la validazione dello schema
 * sta nelle rotte, questo modulo traduce sessioni già valide in statement SQL.
 */

const COLONNE_SESSIONE =
  'id, tipo, nome, note, stato, modalita, dispositivo, creata_il, chiusa_il, ricevuta_il, ' +
  'esportata_il, importata_il, cliente, numero_documento';

const COLONNE_RIGA = 'id, sessione_id, codice_prodotto, quantita, barcode_letto, letta_il, ordine';

// L'upsert è per `id`, chiave globale della sessione generata sul telefono. `ricevuta_il` non
// compare nel SET: resta quella dell'invio originale anche quando la sessione viene risostituita.
// Riaprire e richiudere sul telefono riporta lo stato a "chiusa" e azzera le date di export/import.
// `numero_documento` non compare nel SET: assegnato una sola volta, alla prima ricezione (v2).
//
// Due varianti della VALUES per `numero_documento`: quando `assegnaNumero` è true (ddt alla prima
// ricezione) legge e "consuma" `tenant.prossimo_numero_documento` con una subquery nello stesso
// statement; l'incremento vero e proprio è lo statement successivo nello stesso batch (v2,
// docs/DECISIONI.md punto 53). D1 esegue un batch come una singola transazione e in ordine, quindi
// la subquery vede ancora il valore non incrementato e due POST concorrenti non si sovrappongono:
// D1 serializza le transazioni di scrittura.
function sqlUpsertSessione(assegnaNumero: boolean): string {
  const numeroDocumento = assegnaNumero
    ? '(SELECT prossimo_numero_documento FROM tenant WHERE id = ?2)'
    : 'NULL';
  return `
INSERT INTO sessione (
  id, tenant_id, tipo, nome, note, stato, modalita, dispositivo, creata_il, chiusa_il, ricevuta_il,
  esportata_il, importata_il, cliente, numero_documento
) VALUES (?1, ?2, ?3, ?4, ?5, 'chiusa', ?6, ?7, ?8, ?9, ?10, NULL, NULL, ?11, ${numeroDocumento})
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
  importata_il = NULL,
  cliente = excluded.cliente
RETURNING ricevuta_il, numero_documento`;
}

const INCREMENTA_NUMERO_DOCUMENTO =
  'UPDATE tenant SET prossimo_numero_documento = prossimo_numero_documento + 1 WHERE id = ?1';

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
  cliente?: ClienteDocumento;
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
  cliente: string | null;
  numero_documento: number | null;
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
  cliente?: ClienteDocumento;
  numeroDocumento?: number;
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

/** Legge il cliente salvato come JSON, `undefined` se assente o non interpretabile. */
function rigaCliente(json: string | null): ClienteDocumento | undefined {
  if (json === null) return undefined;
  try {
    return JSON.parse(json) as ClienteDocumento;
  } catch {
    // Scritto solo da questo modulo come JSON.stringify: non dovrebbe mai capitare.
    return undefined;
  }
}

/** Converte una riga `sessione` nella forma di dominio, senza righe. */
function rigaASommario(riga: RigaSessioneDb): SessioneSommario {
  const cliente = rigaCliente(riga.cliente);
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
    ...(cliente === undefined ? {} : { cliente }),
    ...(riga.numero_documento === null ? {} : { numeroDocumento: riga.numero_documento }),
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

/** Esito dell'upsert: `ricevutaIl` resta quella del primo invio, `numeroDocumento` solo per i ddt. */
export interface EsitoUpsertSessione {
  ricevutaIl: string;
  numeroDocumento?: number;
}

/**
 * Upsert per `id`: crea la sessione oppure sostituisce campi e righe di una già ricevuta.
 * `assegnaNumero` va passato `true` solo per una sessione `ddt` che non esiste ancora: in quel
 * caso legge e incrementa `tenant.prossimo_numero_documento` nello stesso batch (v2). Un upsert
 * successivo della stessa sessione va chiamato con `assegnaNumero: false`: il numero non cambia
 * perché non compare nel SET della ON CONFLICT.
 */
export async function upsertSessione(
  db: D1Database,
  tenantId: string,
  sessione: SessioneDaSalvare,
  adesso: string,
  assegnaNumero: boolean,
): Promise<EsitoUpsertSessione> {
  const statement = [
    db
      .prepare(sqlUpsertSessione(assegnaNumero))
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
        sessione.cliente === undefined ? null : JSON.stringify(sessione.cliente),
      ),
    ...(assegnaNumero ? [db.prepare(INCREMENTA_NUMERO_DOCUMENTO).bind(tenantId)] : []),
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

  let esito: EsitoUpsertSessione = { ricevutaIl: adesso };
  for (let inizio = 0; inizio < statement.length; inizio += STATEMENT_PER_BLOCCO) {
    const blocco = await db.batch(statement.slice(inizio, inizio + STATEMENT_PER_BLOCCO));
    if (inizio === 0) {
      const primaRiga = blocco[0]?.results[0] as
        { ricevuta_il: string; numero_documento: number | null } | undefined;
      esito = {
        ricevutaIl: primaRiga?.ricevuta_il ?? adesso,
        ...(primaRiga?.numero_documento === null || primaRiga?.numero_documento === undefined
          ? {}
          : { numeroDocumento: primaRiga.numero_documento }),
      };
    }
  }
  return esito;
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
              s.chiusa_il, s.ricevuta_il, s.esportata_il, s.importata_il, s.cliente, s.numero_documento,
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

/** Tenant a cui appartiene una sessione, o `null` se l'id non esiste. */
export async function proprietarioSessione(db: D1Database, id: string): Promise<string | null> {
  const riga = await db
    .prepare('SELECT tenant_id FROM sessione WHERE id = ?1')
    .bind(id)
    .first<{ tenant_id: string }>();
  return riga === null ? null : riga.tenant_id;
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

/**
 * Imposta lo stato della sessione. Verso `esportata` o `importata` scrive la data relativa;
 * verso `chiusa` (rifare l'export) azzera le date di esportazione e importazione.
 */
export async function impostaStato(
  db: D1Database,
  tenantId: string,
  id: string,
  nuovoStato: 'esportata' | 'importata' | 'chiusa',
  adesso: string,
): Promise<SessioneSommario | null> {
  const assegnazione =
    nuovoStato === 'chiusa'
      ? 'esportata_il = NULL, importata_il = NULL'
      : `${nuovoStato === 'esportata' ? 'esportata_il' : 'importata_il'} = ?4`;
  const riga = await db
    .prepare(
      `UPDATE sessione SET stato = ?3, ${assegnazione}
       WHERE id = ?1 AND tenant_id = ?2
       RETURNING ${COLONNE_SESSIONE}`,
    )
    .bind(
      ...(nuovoStato === 'chiusa'
        ? [id, tenantId, nuovoStato]
        : [id, tenantId, nuovoStato, adesso]),
    )
    .first<RigaSessioneDb>();
  return riga === null ? null : rigaASommario(riga);
}

/** Esito del tentativo di cancellazione di una sessione (v2). */
export type EsitoEliminaSessione = 'eliminata' | 'non_trovata' | 'non_cancellabile';

/**
 * Cancella una sessione e le sue righe, solo se è ancora `chiusa`: una volta che Easyfatt l'ha
 * scaricata (`esportata` o `importata`) il telefono non può più farla sparire da sotto (v2,
 * docs/DECISIONI.md punto 57).
 */
export async function eliminaSessione(
  db: D1Database,
  tenantId: string,
  id: string,
): Promise<EsitoEliminaSessione> {
  const riga = await db
    .prepare('SELECT stato FROM sessione WHERE id = ?1 AND tenant_id = ?2')
    .bind(id, tenantId)
    .first<{ stato: string }>();
  if (riga === null) return 'non_trovata';
  if (riga.stato !== 'chiusa') return 'non_cancellabile';
  await db.batch([
    db.prepare(ELIMINA_RIGHE).bind(id),
    db.prepare('DELETE FROM sessione WHERE id = ?1 AND tenant_id = ?2').bind(id, tenantId),
  ]);
  return 'eliminata';
}
