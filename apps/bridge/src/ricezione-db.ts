import { aBlocchi } from './catalogo-db.js';

/**
 * Query per la ricezione documenti (v2): le sessioni ddt candidate e le loro righe. La conversione
 * in `DocumentoOrdine` e le transizioni di stato stanno nella rotta (docs/DECISIONI.md punto 53).
 */

/** Sessione ddt candidata alla ricezione, così com'è su D1. */
export interface CandidataRicezioneDb {
  id: string;
  numero_documento: number;
  stato: 'chiusa' | 'esportata' | 'importata';
  chiusa_il: string;
  cliente: string | null;
}

/**
 * Sessioni ddt del tenant con un numero assegnato, filtrate su `firstnum`/`lastnum` se indicati.
 * Il filtro per data è lasciato al chiamante: la data del documento va letta nel fuso orario del
 * tenant (docs/DECISIONI.md punto 60), cosa che qui non si può fare in SQL.
 */
export async function sessioniDdtCandidate(
  db: D1Database,
  tenantId: string,
  firstnum: number | undefined,
  lastnum: number | undefined,
): Promise<CandidataRicezioneDb[]> {
  const condizioni = ['tenant_id = ?1', "tipo = 'ddt'", 'numero_documento IS NOT NULL'];
  const parametri: (string | number)[] = [tenantId];
  if (firstnum !== undefined) {
    parametri.push(firstnum);
    condizioni.push(`numero_documento >= ?${parametri.length}`);
  }
  if (lastnum !== undefined) {
    parametri.push(lastnum);
    condizioni.push(`numero_documento <= ?${parametri.length}`);
  }
  const risultato = await db
    .prepare(
      `SELECT id, numero_documento, stato, chiusa_il, cliente FROM sessione
       WHERE ${condizioni.join(' AND ')}
       ORDER BY numero_documento`,
    )
    .bind(...parametri)
    .all<CandidataRicezioneDb>();
  return risultato.results;
}

/** Riga aggregabile di una sessione, per `aggregaRighe`. */
export interface RigaSessioneRicezioneDb {
  sessione_id: string;
  codice_prodotto: string;
  quantita: number;
  ordine: number;
}

/** Righe delle sessioni indicate, raggruppate per sessione. */
export async function righeDiSessioni(
  db: D1Database,
  idSessioni: readonly string[],
): Promise<Map<string, RigaSessioneRicezioneDb[]>> {
  const mappa = new Map<string, RigaSessioneRicezioneDb[]>();
  // A blocchi: D1 accetta al massimo 100 parametri per statement (vedi `PARAMETRI_PER_QUERY`).
  for (const blocco of aBlocchi(idSessioni)) {
    const segnaposto = blocco.map((_, indice) => `?${indice + 1}`).join(', ');
    const risultato = await db
      .prepare(
        `SELECT sessione_id, codice_prodotto, quantita, ordine FROM riga
         WHERE sessione_id IN (${segnaposto})
         ORDER BY sessione_id, ordine`,
      )
      .bind(...blocco)
      .all<RigaSessioneRicezioneDb>();
    for (const riga of risultato.results) {
      const lista = mappa.get(riga.sessione_id) ?? [];
      lista.push(riga);
      mappa.set(riga.sessione_id, lista);
    }
  }
  return mappa;
}

/** Segna come `esportata` le sessioni indicate, ancora `chiusa`: prima consegna a Easyfatt. */
export function statementSegnaEsportate(
  db: D1Database,
  idSessioni: readonly string[],
  adesso: string,
): D1PreparedStatement[] {
  return idSessioni.map((id) =>
    db
      .prepare("UPDATE sessione SET stato = 'esportata', esportata_il = ?2 WHERE id = ?1")
      .bind(id, adesso),
  );
}

/**
 * Segna come `importata` le sessioni indicate, già `esportata`: Easyfatt le riceve di nuovo, quindi
 * le aveva già avute a uno scarico precedente. Serve perché Easyfatt chiede sempre `firstnum=1`
 * (collaudo T10, docs/DECISIONI.md punto 67) e la regola di {@link statementSegnaImportatePrimaDi}
 * non scatta mai. Le sessioni restano comunque nella risposta: se il primo import era stato
 * annullato, Easyfatt le riprende.
 */
export function statementSegnaImportate(
  db: D1Database,
  idSessioni: readonly string[],
  adesso: string,
): D1PreparedStatement[] {
  return idSessioni.map((id) =>
    db
      .prepare(
        "UPDATE sessione SET stato = 'importata', importata_il = ?2 WHERE id = ?1 AND stato = 'esportata'",
      )
      .bind(id, adesso),
  );
}

/**
 * Segna come `importata` le sessioni ddt del tenant ancora `esportata` con numero minore di
 * `firstnum`: Easyfatt ha chiesto di ripartire da lì, quindi le precedenti sono state importate
 * (docs/DECISIONI.md punto 53).
 */
export function statementSegnaImportatePrimaDi(
  db: D1Database,
  tenantId: string,
  firstnum: number,
  adesso: string,
): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE sessione SET stato = 'importata', importata_il = ?3
       WHERE tenant_id = ?1 AND tipo = 'ddt' AND stato = 'esportata' AND numero_documento < ?2`,
    )
    .bind(tenantId, firstnum, adesso);
}
