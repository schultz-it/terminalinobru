import { Hono } from 'hono';
import type { Contesto } from './ambiente.js';
import { autenticaApp } from './autenticazione.js';
import type { RigaBarcode, RigaProdotto } from './catalogo-db.js';
import { rigaABarcode, rigaAProdotto } from './catalogo-db.js';

/** Rotte usate dalla PWA, tutte dietro il token Bearer del tenant. */
export const rotteApi = new Hono<Contesto>();

/** Oltre questo numero di prodotti la risposta del catalogo non viene generata. */
export const LIMITE_PRODOTTI_RISPOSTA = 20_000;

const COLONNE_PRODOTTO =
  'codice, descrizione, categoria, sottocategoria, um, prezzi_netti, prezzi_lordi, iva_perc, ' +
  'gestione_magazzino, ubicazione, scorta_minima, giacenza, ordinato, fornitore, ' +
  'codice_fornitore, note, aggiornato_il, eliminato_il';

const COLONNE_BARCODE = 'barcode, codice_prodotto, origine, quantita_confezione, aggiornato_il';

rotteApi.use('/stato', autenticaApp);
rotteApi.use('/catalogo', autenticaApp);

/** Stato del tenant per la schermata Impostazioni della PWA. */
rotteApi.get('/stato', async (c) => {
  const tenant = c.get('tenant');
  const conteggio = await c.env.DB.prepare(
    'SELECT COUNT(*) AS totale FROM prodotto WHERE tenant_id = ?1 AND eliminato_il IS NULL',
  )
    .bind(tenant.id)
    .first<{ totale: number }>();
  return c.json({
    nome: tenant.nome,
    ultimoCatalogoIl: tenant.ultimo_catalogo_il,
    prodotti: conteggio?.totale ?? 0,
  });
});

/**
 * Catalogo completo o delta. Senza `dal` restituisce tutti i prodotti e i barcode non eliminati;
 * con `dal` solo quelli modificati dopo quell'istante, più i codici eliminati dopo di esso.
 */
rotteApi.get('/catalogo', async (c) => {
  const tenant = c.get('tenant');
  const dalGrezzo = c.req.query('dal');
  let dal: string | undefined;
  if (dalGrezzo !== undefined && dalGrezzo !== '') {
    if (Number.isNaN(Date.parse(dalGrezzo))) {
      return c.json({ errore: 'Parametro «dal» non valido: attesa una data ISO 8601.' }, 400);
    }
    dal = dalGrezzo;
  }

  const db = c.env.DB;
  const filtroNuovi = dal === undefined ? '' : ' AND aggiornato_il > ?2';
  const parametri = dal === undefined ? [tenant.id] : [tenant.id, dal];

  const conteggio = await db
    .prepare(
      `SELECT COUNT(*) AS totale FROM prodotto
       WHERE tenant_id = ?1 AND eliminato_il IS NULL${filtroNuovi}`,
    )
    .bind(...parametri)
    .first<{ totale: number }>();
  const totale = conteggio?.totale ?? 0;
  if (totale > LIMITE_PRODOTTI_RISPOSTA) {
    return c.json(
      {
        errore:
          `La risposta conterrebbe ${totale} prodotti, oltre il limite di ` +
          `${LIMITE_PRODOTTI_RISPOSTA}. Sincronizza più spesso usando il parametro «dal».`,
      },
      413,
    );
  }

  const prodotti = await db
    .prepare(
      `SELECT ${COLONNE_PRODOTTO} FROM prodotto
       WHERE tenant_id = ?1 AND eliminato_il IS NULL${filtroNuovi}
       ORDER BY codice`,
    )
    .bind(...parametri)
    .all<RigaProdotto>();

  const barcode = await db
    .prepare(
      `SELECT ${COLONNE_BARCODE} FROM barcode
       WHERE tenant_id = ?1 AND eliminato_il IS NULL${filtroNuovi}
       ORDER BY barcode`,
    )
    .bind(...parametri)
    .all<RigaBarcode>();

  let prodottiEliminati: string[] = [];
  let barcodeEliminati: string[] = [];
  if (dal !== undefined) {
    const prodottiFuori = await db
      .prepare(
        `SELECT codice FROM prodotto
         WHERE tenant_id = ?1 AND eliminato_il IS NOT NULL AND eliminato_il > ?2
         ORDER BY codice`,
      )
      .bind(tenant.id, dal)
      .all<{ codice: string }>();
    prodottiEliminati = prodottiFuori.results.map((riga) => riga.codice);

    const barcodeFuori = await db
      .prepare(
        `SELECT barcode FROM barcode
         WHERE tenant_id = ?1 AND eliminato_il IS NOT NULL AND eliminato_il > ?2
         ORDER BY barcode`,
      )
      .bind(tenant.id, dal)
      .all<{ barcode: string }>();
    barcodeEliminati = barcodeFuori.results.map((riga) => riga.barcode);
  }

  return c.json({
    aggiornatoIl: new Date().toISOString(),
    prodotti: prodotti.results.map(rigaAProdotto),
    barcode: barcode.results.map(rigaABarcode),
    prodottiEliminati,
    barcodeEliminati,
  });
});
