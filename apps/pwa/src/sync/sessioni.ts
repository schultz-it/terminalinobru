import type { Impostazioni, StatoSessione } from '@terminalinobru/core';
import { z } from 'zod';
import { messaggioErrore, richiestaBridge } from '../api.js';
import type { DatabaseTerminalino, SessioneLocale } from '../db.js';

/** Stati di sessione che il bridge conserva: `aperta` vive solo sul telefono. */
const schemaStatoSessioneBridge = z.enum(['chiusa', 'esportata', 'importata']);

const schemaSessioneBridge = z.object({
  id: z.string(),
  tipo: z.enum(['inventario', 'ddt', 'carico']),
  nome: z.string(),
  note: z.string().optional(),
  stato: schemaStatoSessioneBridge,
  modalita: z.enum(['chiedi_quantita', 'somma_uno']),
  dispositivo: z.string().optional(),
  creataIl: z.string(),
  chiusaIl: z.string(),
  ricevutaIl: z.string(),
  esportataIl: z.string().optional(),
  importataIl: z.string().optional(),
  conteggioRighe: z.number(),
  sommaQuantita: z.number(),
});

/** Sessione così come la restituisce `GET /api/sessioni` del bridge, con conteggio e somma righe. */
export type SessioneBridge = z.output<typeof schemaSessioneBridge>;

const schemaElencoSessioniBridge = z.array(schemaSessioneBridge);

/** Legge l'elenco completo delle sessioni del tenant sul bridge (mai `aperta`, non esiste lì). */
export function elencoSessioniBridge(
  connessione: Pick<Impostazioni, 'urlBridge' | 'token'>,
  recupera: typeof fetch = fetch,
): Promise<SessioneBridge[]> {
  return richiestaBridge(connessione, '/api/sessioni', schemaElencoSessioniBridge, recupera);
}

/**
 * Sessioni locali non aperte il cui stato non combacia più con quello del bridge: `chiusa` diventa
 * `esportata` o `importata` dopo l'export dal PC, `esportata` torna `chiusa` se il PC rifà l'export.
 * Le sessioni aperte sul telefono non si toccano mai; quelle non ancora arrivate al bridge
 * (`statoBridge` senza il loro id) restano come sono.
 */
export function sessioniDaAllineare(
  locali: readonly Pick<SessioneLocale, 'id' | 'stato'>[],
  statoBridge: ReadonlyMap<string, StatoSessione>,
): { id: string; stato: StatoSessione }[] {
  const risultato: { id: string; stato: StatoSessione }[] = [];
  for (const sessione of locali) {
    if (sessione.stato === 'aperta') continue;
    const remoto = statoBridge.get(sessione.id);
    if (remoto === undefined || remoto === sessione.stato) continue;
    risultato.push({ id: sessione.id, stato: remoto });
  }
  return risultato;
}

export type OpzioniAllineamento = {
  db: DatabaseTerminalino;
  impostazioni: Pick<Impostazioni, 'urlBridge' | 'token'>;
  recupera?: typeof fetch;
};

/** Esito dell'allineamento: non lancia mai, ogni problema torna come messaggio leggibile. */
export type EsitoAllineamento =
  | { ok: true; aggiornate: number }
  | { ok: false; messaggio: string };

/**
 * Allinea lo stato delle sessioni locali non aperte con quello del bridge. Solo lettura verso il
 * bridge: non invia mai nulla, si limita ad aggiornare Dexie.
 */
export async function allineaSessioniLocali(
  opzioni: OpzioniAllineamento,
): Promise<EsitoAllineamento> {
  const { db, impostazioni, recupera } = opzioni;
  try {
    const elenco = await elencoSessioniBridge(impostazioni, recupera);
    const statoBridge = new Map(elenco.map((sessione) => [sessione.id, sessione.stato]));
    const locali = await db.sessioni.toArray();
    const daAggiornare = sessioniDaAllineare(locali, statoBridge);
    if (daAggiornare.length > 0) {
      await db.transaction('rw', db.sessioni, async () => {
        for (const { id, stato } of daAggiornare) {
          await db.sessioni.update(id, { stato });
        }
      });
    }
    return { ok: true, aggiornate: daAggiornare.length };
  } catch (errore) {
    return { ok: false, messaggio: messaggioErrore(errore) };
  }
}
