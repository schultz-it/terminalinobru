import type { Impostazioni } from '@terminalinobru/core';
import { useSyncExternalStore } from 'react';
import { ErroreBridge, inviaJsonAlBridge, messaggioErrore } from '../api.js';
import { db as dbApp, type DatabaseTerminalino, type VoceCodaUpload } from '../db.js';
import { caricaImpostazioni } from '../impostazioni.js';
import { sessioneCompleta } from '../sessioni/operazioni.js';

/** Esito di un giro sulla coda. Non lancia mai: gli errori restano scritti sulle voci. */
export type EsitoCoda = {
  inviate: number;
  rimaste: number;
  /** Primo errore incontrato, già in italiano, se c'è stato. */
  errore?: string;
};

export type OpzioniCoda = {
  db: DatabaseTerminalino;
  impostazioni: Pick<Impostazioni, 'urlBridge' | 'token'>;
  recupera?: typeof fetch;
};

/** Il bridge non è stato raggiunto: inutile provare le voci successive. */
function irraggiungibile(errore: unknown): boolean {
  return !(errore instanceof ErroreBridge) || errore.stato === undefined;
}

async function registraErrore(
  db: DatabaseTerminalino,
  voci: readonly VoceCodaUpload[],
  errore: unknown,
): Promise<string> {
  const messaggio = messaggioErrore(errore);
  await db.transaction('rw', db.codaUpload, async () => {
    for (const voce of voci) {
      if (voce.id === undefined) continue;
      // La voce può essere sparita nel frattempo (sessione riaperta): in quel caso niente.
      await db.codaUpload.update(voce.id, {
        tentativi: voce.tentativi + 1,
        ultimoErrore: messaggio,
      });
    }
  });
  return messaggio;
}

/**
 * Invia una sessione chiusa. Toglie la voce solo se la sessione è ancora quella spedita: se nel
 * frattempo è stata riaperta e richiusa, la voce resta per rispedire la versione nuova.
 */
async function inviaSessione(
  opzioni: OpzioniCoda,
  voce: VoceCodaUpload,
): Promise<'inviata' | 'scartata'> {
  const { db, impostazioni, recupera } = opzioni;
  const sessione = await sessioneCompleta(db, voce.riferimento);
  if (!sessione || sessione.stato !== 'chiusa') {
    // Cancellata o riaperta: la rispedirà la prossima chiusura.
    if (voce.id !== undefined) await db.codaUpload.delete(voce.id);
    return 'scartata';
  }
  await inviaJsonAlBridge(impostazioni, '/api/sessioni', sessione, recupera);
  await db.transaction('rw', db.sessioni, db.codaUpload, async () => {
    const attuale = await db.sessioni.get(voce.riferimento);
    if (attuale?.stato === 'chiusa' && attuale.chiusaIl !== sessione.chiusaIl) return;
    if (voce.id !== undefined) await db.codaUpload.delete(voce.id);
  });
  return 'inviata';
}

/**
 * Invia in una sola chiamata tutti gli abbinamenti barcode in coda, letti dallo store `barcode`
 * al momento dell'invio. Le voci il cui abbinamento non esiste più, o è passato a Easyfatt,
 * vengono scartate.
 */
async function inviaBarcode(
  opzioni: OpzioniCoda,
  voci: readonly VoceCodaUpload[],
): Promise<number> {
  const { db, impostazioni, recupera } = opzioni;
  const corpo: { barcode: string; codiceProdotto: string }[] = [];
  const daInviare: VoceCodaUpload[] = [];
  for (const voce of voci) {
    const abbinamento = await db.barcode.get(voce.riferimento);
    if (abbinamento?.origine === 'app') {
      corpo.push({ barcode: abbinamento.barcode, codiceProdotto: abbinamento.codiceProdotto });
      daInviare.push(voce);
    } else if (voce.id !== undefined) {
      await db.codaUpload.delete(voce.id);
    }
  }
  if (corpo.length === 0) return 0;
  await inviaJsonAlBridge(impostazioni, '/api/barcode', corpo, recupera);
  await db.transaction('rw', db.barcode, db.codaUpload, async () => {
    for (const [i, voce] of daInviare.entries()) {
      const attuale = await db.barcode.get(voce.riferimento);
      // Riabbinato durante l'invio: resta in coda per mandare l'abbinamento nuovo.
      if (attuale && attuale.codiceProdotto !== corpo[i]?.codiceProdotto) continue;
      if (voce.id !== undefined) await db.codaUpload.delete(voce.id);
    }
  });
  return daInviare.length;
}

/**
 * Fa un giro completo sulla coda: prima gli abbinamenti barcode, poi le sessioni in ordine di
 * chiusura. Se il bridge non risponde si ferma; se rifiuta una voce annota l'errore e passa alla
 * successiva.
 */
export async function svuotaCoda(opzioni: OpzioniCoda): Promise<EsitoCoda> {
  const { db } = opzioni;
  let inviate = 0;
  let errore: string | undefined;
  try {
    const voci = await db.codaUpload.orderBy('id').toArray();
    const barcode = voci.filter((voce) => voce.tipo === 'barcode');
    const sessioni = voci.filter((voce) => voce.tipo === 'sessione');
    let fermo = false;

    if (barcode.length > 0) {
      try {
        inviate += await inviaBarcode(opzioni, barcode);
      } catch (e) {
        errore = await registraErrore(db, barcode, e);
        fermo = irraggiungibile(e);
      }
    }

    for (const voce of sessioni) {
      if (fermo) break;
      try {
        if ((await inviaSessione(opzioni, voce)) === 'inviata') inviate += 1;
      } catch (e) {
        const messaggio = await registraErrore(db, [voce], e);
        errore ??= messaggio;
        fermo = irraggiungibile(e);
      }
    }
  } catch (e) {
    errore ??= messaggioErrore(e);
  }
  const rimaste = await db.codaUpload.count().catch(() => 0);
  return { inviate, rimaste, ...(errore === undefined ? {} : { errore }) };
}

/** Stato condiviso del servizio della coda, letto dalle schermate. */
export type StatoCoda = { inCorso: boolean; ultimoEsito?: EsitoCoda };

export type ServizioCoda = {
  /**
   * Avvia un giro. Se ne è già in corso uno restituisce quello (una voce non parte due volte) e
   * ne fa partire un altro alla fine, per le voci aggiunte nel frattempo.
   */
  invia: () => Promise<EsitoCoda>;
  stato: () => StatoCoda;
  iscrivi: (ascolta: () => void) => () => void;
};

/**
 * Crea il servizio della coda: un solo giro alla volta, con le impostazioni lette a ogni giro.
 * Se il telefono è offline non prova nemmeno, così i tentativi non crescono a vuoto.
 */
export function creaServizioCoda(dipendenze: {
  db: DatabaseTerminalino;
  recupera?: typeof fetch;
  online?: () => boolean;
}): ServizioCoda {
  const { db, recupera, online = () => navigator.onLine } = dipendenze;
  let stato: StatoCoda = { inCorso: false };
  let inCorso: Promise<EsitoCoda> | undefined;
  // Richiesta arrivata durante un giro (per esempio una sessione chiusa mentre se ne inviava
  // un'altra): le voci nuove non erano nell'elenco letto all'inizio, serve un giro in più.
  let altroGiro = false;
  const ascoltatori = new Set<() => void>();
  const aggiorna = (nuovo: StatoCoda) => {
    stato = nuovo;
    for (const ascolta of ascoltatori) ascolta();
  };

  const invia = (): Promise<EsitoCoda> => {
    if (inCorso) {
      altroGiro = true;
      return inCorso;
    }
    aggiorna({ ...stato, inCorso: true });
    inCorso = (async (): Promise<EsitoCoda> => {
      if (!online()) {
        return { inviate: 0, rimaste: await db.codaUpload.count(), errore: 'Sei offline.' };
      }
      const impostazioni = await caricaImpostazioni(db);
      return svuotaCoda({ db, impostazioni, ...(recupera ? { recupera } : {}) });
    })()
      .catch((): EsitoCoda => ({ inviate: 0, rimaste: 0, errore: 'Errore imprevisto nell’invio.' }))
      .then((esito) => {
        inCorso = undefined;
        aggiorna({ inCorso: false, ultimoEsito: esito });
        if (altroGiro) {
          altroGiro = false;
          void invia();
        }
        return esito;
      });
    return inCorso;
  };

  return {
    invia,
    stato: () => stato,
    iscrivi: (ascolta) => {
      ascoltatori.add(ascolta);
      return () => {
        ascoltatori.delete(ascolta);
      };
    },
  };
}

/** Servizio della coda dell'app, sul database vero. */
export const servizioCoda = creaServizioCoda({ db: dbApp });

/** Avvia l'invio della coda dell'app. */
export function avviaInvioCoda(): Promise<EsitoCoda> {
  return servizioCoda.invia();
}

/**
 * Riprova l'invio subito e ogni volta che torna la rete. Restituisce la funzione che smette di
 * ascoltare. Da chiamare una volta all'avvio dell'app.
 */
export function avviaServizioCoda(
  servizio: ServizioCoda = servizioCoda,
  finestra: Pick<Window, 'addEventListener' | 'removeEventListener'> = window,
): () => void {
  const alRitornoRete = () => void servizio.invia();
  finestra.addEventListener('online', alRitornoRete);
  void servizio.invia();
  return () => finestra.removeEventListener('online', alRitornoRete);
}

/** Stato corrente del servizio della coda dell'app. */
export function useStatoCoda(): StatoCoda {
  return useSyncExternalStore(servizioCoda.iscrivi, servizioCoda.stato);
}
