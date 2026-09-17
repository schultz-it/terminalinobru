import { schemaBarcode, schemaProdotto, type Impostazioni } from '@terminalinobru/core';
import { z } from 'zod';
import { messaggioErrore, richiestaBridge } from '../api.js';
import type { DatabaseTerminalino } from '../db.js';
import { CHIAVE_CURSORE_CATALOGO } from '../impostazioni.js';

/** Dopo quanto tempo dall'ultima sincronizzazione l'app ne avvia una da sola all'apertura. */
export const INTERVALLO_SYNC_AUTOMATICA_MS = 6 * 60 * 60 * 1000;

const schemaRispostaCatalogo = z.object({
  aggiornatoIl: z.string().min(1),
  prodotti: z.array(schemaProdotto),
  barcode: z.array(schemaBarcode),
  prodottiEliminati: z.array(z.string()),
  barcodeEliminati: z.array(z.string()),
});

/** Risposta di `GET /api/catalogo` (docs/MODELLO-DATI.md sezione 4). */
export type RispostaCatalogo = z.output<typeof schemaRispostaCatalogo>;

/** Esito di una sincronizzazione: mai un'eccezione, sempre un risultato da mostrare. */
export type EsitoSync =
  | {
      ok: true;
      completa: boolean;
      prodottiAggiornati: number;
      prodottiEliminati: number;
      barcodeAggiornati: number;
      barcodeEliminati: number;
    }
  | { ok: false; messaggio: string };

/** Dipendenze della sincronizzazione, iniettabili nei test. */
export type OpzioniSync = {
  db: DatabaseTerminalino;
  impostazioni: Pick<Impostazioni, 'urlBridge' | 'token'>;
  recupera?: typeof fetch;
  /** Orologio del telefono: serve solo a ricordare quando è stata fatta l'ultima sync. */
  adesso?: () => Date;
};

/** Legge il cursore salvato dall'ultima risposta del catalogo, se c'è. */
export async function leggiCursoreCatalogo(db: DatabaseTerminalino): Promise<string | undefined> {
  const voce = await db.impostazioni.get(CHIAVE_CURSORE_CATALOGO);
  return typeof voce?.valore === 'string' && voce.valore !== '' ? voce.valore : undefined;
}

/** Applica una risposta del catalogo in un'unica transazione e salva il nuovo cursore. */
export async function applicaCatalogo(
  db: DatabaseTerminalino,
  risposta: RispostaCatalogo,
  completa: boolean,
  adesso: Date,
): Promise<void> {
  await db.transaction('rw', [db.prodotti, db.barcode, db.impostazioni], async () => {
    if (completa) {
      // Catalogo completo: sostituisce tutto, tranne gli abbinamenti creati sul telefono.
      await db.prodotti.clear();
      await db.barcode.filter((b) => b.origine !== 'app').delete();
    }
    const vivi = risposta.prodotti.filter((p) => p.eliminatoIl === undefined);
    const morti = risposta.prodotti.filter((p) => p.eliminatoIl !== undefined).map((p) => p.codice);
    await db.prodotti.bulkPut(vivi);
    await db.prodotti.bulkDelete([...risposta.prodottiEliminati, ...morti]);
    await db.barcode.bulkPut(risposta.barcode.filter((b) => b.eliminatoIl === undefined));
    await db.barcode.bulkDelete([
      ...risposta.barcodeEliminati,
      ...risposta.barcode.filter((b) => b.eliminatoIl !== undefined).map((b) => b.barcode),
    ]);
    await db.impostazioni.bulkPut([
      { chiave: CHIAVE_CURSORE_CATALOGO, valore: risposta.aggiornatoIl },
      { chiave: 'ultimaSincronizzazione', valore: adesso.toISOString() },
    ]);
  });
}

/**
 * Scarica il catalogo dal bridge (delta dal cursore salvato, completo la prima volta) e lo
 * applica a Dexie. Non lancia mai: gli errori tornano come messaggio leggibile.
 */
export async function sincronizzaCatalogo(opzioni: OpzioniSync): Promise<EsitoSync> {
  const { db, impostazioni, recupera = fetch, adesso = () => new Date() } = opzioni;
  try {
    const cursore = await leggiCursoreCatalogo(db);
    const percorso =
      cursore === undefined ? '/api/catalogo' : `/api/catalogo?dal=${encodeURIComponent(cursore)}`;
    const risposta = await richiestaBridge(
      impostazioni,
      percorso,
      schemaRispostaCatalogo,
      recupera,
    );
    const completa = cursore === undefined;
    await applicaCatalogo(db, risposta, completa, adesso());
    return {
      ok: true,
      completa,
      prodottiAggiornati: risposta.prodotti.length,
      prodottiEliminati: risposta.prodottiEliminati.length,
      barcodeAggiornati: risposta.barcode.length,
      barcodeEliminati: risposta.barcodeEliminati.length,
    };
  } catch (errore) {
    return { ok: false, messaggio: messaggioErrore(errore) };
  }
}

/** Dice se all'avvio va lanciata la sincronizzazione automatica. */
export function serveSyncAutomatica(stato: {
  online: boolean;
  token: string;
  ultimaSincronizzazione: string | undefined;
  adesso: Date;
}): boolean {
  if (!stato.online || stato.token.trim() === '') return false;
  if (stato.ultimaSincronizzazione === undefined) return true;
  const ultima = Date.parse(stato.ultimaSincronizzazione);
  if (Number.isNaN(ultima)) return true;
  const trascorso = stato.adesso.getTime() - ultima;
  // Orologio del telefono spostato indietro: meglio sincronizzare che restare fermi.
  return trascorso > INTERVALLO_SYNC_AUTOMATICA_MS || trascorso < 0;
}
