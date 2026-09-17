import { schemaCliente, type Cliente } from '@terminalinobru/core';
import { z } from 'zod';
import { messaggioErrore, richiestaBridge } from '../api.js';
import type { DatabaseTerminalino } from '../db.js';
import { CHIAVE_CURSORE_CLIENTI } from '../impostazioni.js';
import { sincronizzaCatalogo, type EsitoSync, type OpzioniSync } from './catalogo.js';

const schemaRispostaClienti = z.object({
  aggiornatoIl: z.string().min(1),
  clienti: z.array(schemaCliente),
  clientiEliminati: z.array(z.string()),
});

/** Risposta di `GET /api/clienti` (docs/MODELLO-DATI.md sezione 4). */
export type RispostaClienti = z.output<typeof schemaRispostaClienti>;

/** Esito della sincronizzazione dei clienti: mai un'eccezione, sempre un risultato da mostrare. */
export type EsitoSyncClienti =
  | { ok: true; completa: boolean; clientiAggiornati: number; clientiEliminati: number }
  | { ok: false; messaggio: string };

/** Legge il cursore salvato dall'ultima risposta dei clienti, se c'è. */
export async function leggiCursoreClienti(db: DatabaseTerminalino): Promise<string | undefined> {
  const voce = await db.impostazioni.get(CHIAVE_CURSORE_CLIENTI);
  return typeof voce?.valore === 'string' && voce.valore !== '' ? voce.valore : undefined;
}

/**
 * Clienti creati in app che l'export di Easyfatt ha reso superflui: stessa partita IVA o stesso
 * codice fiscale di un cliente arrivato da Easyfatt (docs/DECISIONI.md punto 56).
 */
export function clientiAppSostituiti(
  locali: readonly Pick<Cliente, 'id' | 'origine' | 'partitaIva' | 'codiceFiscale'>[],
  daEasyfatt: readonly Pick<Cliente, 'partitaIva' | 'codiceFiscale'>[],
): string[] {
  const partiteIva = new Set<string>();
  const codiciFiscali = new Set<string>();
  for (const cliente of daEasyfatt) {
    if (cliente.partitaIva) partiteIva.add(cliente.partitaIva.toUpperCase());
    if (cliente.codiceFiscale) codiciFiscali.add(cliente.codiceFiscale.toUpperCase());
  }
  return locali
    .filter(
      (cliente) =>
        cliente.origine === 'app' &&
        ((cliente.partitaIva !== undefined && partiteIva.has(cliente.partitaIva.toUpperCase())) ||
          (cliente.codiceFiscale !== undefined &&
            codiciFiscali.has(cliente.codiceFiscale.toUpperCase()))),
    )
    .map((cliente) => cliente.id);
}

/**
 * Applica una risposta dei clienti in un'unica transazione e salva il nuovo cursore. Come per il
 * catalogo: la risposta completa sostituisce i clienti di Easyfatt, i tombstone tolgono. I clienti
 * creati in app restano, salvo quelli che Easyfatt ora conosce con la stessa partita IVA o lo
 * stesso codice fiscale.
 */
export async function applicaClienti(
  db: DatabaseTerminalino,
  risposta: RispostaClienti,
  completa: boolean,
): Promise<void> {
  await db.transaction('rw', [db.clienti, db.impostazioni], async () => {
    if (completa) await db.clienti.where('origine').equals('easyfatt').delete();
    // Il bridge conserva solo l'export di Easyfatt: un cliente con altra origine non è previsto.
    const vivi = risposta.clienti.filter(
      (cliente) => cliente.eliminatoIl === undefined && cliente.origine === 'easyfatt',
    );
    const morti = risposta.clienti
      .filter((cliente) => cliente.eliminatoIl !== undefined)
      .map((cliente) => cliente.id);
    const locali = await db.clienti.where('origine').equals('app').toArray();
    await db.clienti.bulkDelete(clientiAppSostituiti(locali, vivi));
    await db.clienti.bulkPut(vivi);
    // Un tombstone non deve mai togliere un cliente creato in app che avesse lo stesso id.
    const daTogliere = await db.clienti.bulkGet([...risposta.clientiEliminati, ...morti]);
    await db.clienti.bulkDelete(
      daTogliere.flatMap((cliente) => (cliente?.origine === 'easyfatt' ? [cliente.id] : [])),
    );
    await db.impostazioni.put({ chiave: CHIAVE_CURSORE_CLIENTI, valore: risposta.aggiornatoIl });
  });
}

/**
 * Scarica i clienti dal bridge (delta dal cursore salvato, tutti la prima volta) e li applica a
 * Dexie. Non lancia mai: gli errori tornano come messaggio leggibile.
 */
export async function sincronizzaClienti(
  opzioni: Pick<OpzioniSync, 'db' | 'impostazioni' | 'recupera'>,
): Promise<EsitoSyncClienti> {
  const { db, impostazioni, recupera = fetch } = opzioni;
  try {
    const cursore = await leggiCursoreClienti(db);
    const percorso =
      cursore === undefined ? '/api/clienti' : `/api/clienti?dal=${encodeURIComponent(cursore)}`;
    const risposta = await richiestaBridge(impostazioni, percorso, schemaRispostaClienti, recupera);
    const completa = cursore === undefined;
    await applicaClienti(db, risposta, completa);
    return {
      ok: true,
      completa,
      clientiAggiornati: risposta.clienti.length,
      clientiEliminati: risposta.clientiEliminati.length,
    };
  } catch (errore) {
    return { ok: false, messaggio: messaggioErrore(errore) };
  }
}

/** Esito della sincronizzazione completa: catalogo più clienti. */
export type EsitoSyncCompleta =
  | (Extract<EsitoSync, { ok: true }> & { clientiAggiornati: number; clientiEliminati: number })
  | { ok: false; messaggio: string };

/**
 * Sincronizzazione dell'app: prima il catalogo, poi i clienti con il loro cursore. Se il catalogo
 * fallisce i clienti non si chiedono nemmeno; se falliscono solo i clienti, il catalogo resta
 * aggiornato e il messaggio lo dice.
 */
export async function sincronizzaCatalogoEClienti(
  opzioni: OpzioniSync,
): Promise<EsitoSyncCompleta> {
  const catalogo = await sincronizzaCatalogo(opzioni);
  if (!catalogo.ok) return catalogo;
  const clienti = await sincronizzaClienti(opzioni);
  if (!clienti.ok) {
    return { ok: false, messaggio: `Catalogo aggiornato, clienti no: ${clienti.messaggio}` };
  }
  return {
    ...catalogo,
    clientiAggiornati: clienti.clientiAggiornati,
    clientiEliminati: clienti.clientiEliminati,
  };
}
