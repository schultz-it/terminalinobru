import {
  arrotondaQuantita,
  schemaClienteDocumento,
  transizioneStato,
  type ClienteDocumento,
  type ModalitaScansione,
  type Riga,
  type Sessione,
  type TipoSessione,
} from '@terminalinobru/core';
import { chiamaBridge, ErroreBridge, messaggioErrore, type Connessione } from '../api.js';
import type { DatabaseTerminalino, SessioneLocale } from '../db.js';
import { generaUuid } from './modello.js';
import { quantitaSalvabile } from './quantita.js';

/** Errore di un'operazione sulle sessioni, con messaggio già pronto per l'utente. */
export class ErroreSessione extends Error {
  constructor(messaggio: string) {
    super(messaggio);
    this.name = 'ErroreSessione';
  }
}

/** Dopo quanti giorni una sessione importata in Easyfatt si può cancellare dal telefono. */
export const GIORNI_CONSERVAZIONE_IMPORTATE = 90;

export type DatiNuovaSessione = {
  tipo: TipoSessione;
  nome: string;
  note?: string;
  modalita: ModalitaScansione;
  dispositivo?: string;
  /** Obbligatorio per i DDT: copia completa del cliente scelto o creato sul telefono. */
  cliente?: ClienteDocumento;
};

/** Messaggio per un DDT senza cliente, in creazione e in chiusura. */
const MANCA_CLIENTE = 'Scegli il cliente del DDT.';

/**
 * Controlla i dati di una nuova sessione prima di crearla. Restituisce il messaggio del primo
 * problema, oppure `undefined` se è tutto a posto.
 */
export function validaNuovaSessione(dati: DatiNuovaSessione): string | undefined {
  if (dati.nome.trim() === '') return 'Dai un nome alla sessione.';
  if (dati.tipo === 'ddt') {
    if (dati.cliente === undefined) return MANCA_CLIENTE;
    if (!schemaClienteDocumento.safeParse(dati.cliente).success) {
      return 'I dati del cliente non sono validi: correggili o scegline un altro.';
    }
  }
  return undefined;
}

/** Crea una sessione aperta sul telefono. */
export async function creaSessione(
  db: DatabaseTerminalino,
  dati: DatiNuovaSessione,
  adesso: Date = new Date(),
  generaId: () => string = generaUuid,
): Promise<SessioneLocale> {
  const errore = validaNuovaSessione(dati);
  if (errore !== undefined) throw new ErroreSessione(errore);
  const nome = dati.nome.trim();
  const note = dati.note?.trim();
  const dispositivo = dati.dispositivo?.trim();
  const sessione: SessioneLocale = {
    id: generaId(),
    tipo: dati.tipo,
    nome,
    stato: 'aperta',
    modalita: dati.modalita,
    creataIl: adesso.toISOString(),
    ...(note ? { note } : {}),
    ...(dispositivo ? { dispositivo } : {}),
    // Solo i DDT portano il cliente: negli altri tipi Easyfatt non lo userebbe.
    ...(dati.tipo === 'ddt' && dati.cliente ? { cliente: dati.cliente } : {}),
  };
  await db.sessioni.add(sessione);
  return sessione;
}

async function sessioneAperta(db: DatabaseTerminalino, id: string): Promise<SessioneLocale> {
  const sessione = await db.sessioni.get(id);
  if (!sessione) throw new ErroreSessione('Sessione non trovata.');
  if (sessione.stato !== 'aperta') {
    throw new ErroreSessione('La sessione è chiusa: riaprila per modificarla.');
  }
  return sessione;
}

function controllaQuantita(quantita: number): void {
  if (!quantitaSalvabile(quantita)) {
    throw new ErroreSessione('Quantità non valida: deve essere un numero non negativo.');
  }
}

/** Cambia il cliente di un DDT aperto (per esempio un DDT nato senza cliente prima della v2). */
export async function cambiaClienteSessione(
  db: DatabaseTerminalino,
  id: string,
  cliente: ClienteDocumento,
): Promise<void> {
  if (!schemaClienteDocumento.safeParse(cliente).success) {
    throw new ErroreSessione('I dati del cliente non sono validi: correggili o scegline un altro.');
  }
  await db.transaction('rw', db.sessioni, async () => {
    const sessione = await sessioneAperta(db, id);
    if (sessione.tipo !== 'ddt') throw new ErroreSessione('Solo i DDT hanno un cliente.');
    await db.sessioni.update(id, { cliente });
  });
}

/** Righe di una sessione nell'ordine di inserimento. */
export function righeSessione(db: DatabaseTerminalino, sessioneId: string): Promise<Riga[]> {
  return db.righe
    .where('[sessioneId+ordine]')
    .between([sessioneId, -Infinity], [sessioneId, Infinity])
    .toArray();
}

/**
 * Aggiunge una riga a una sessione aperta, con progressivo successivo all'ultimo.
 * Lo zero è ammesso (inventario di un prodotto esaurito): l'avviso lo chiede l'interfaccia.
 */
export async function aggiungiRiga(
  db: DatabaseTerminalino,
  sessioneId: string,
  dati: { codiceProdotto: string; quantita: number; barcodeLetto?: string },
  adesso: Date = new Date(),
  generaId: () => string = generaUuid,
): Promise<Riga> {
  controllaQuantita(dati.quantita);
  return db.transaction('rw', db.sessioni, db.righe, async () => {
    await sessioneAperta(db, sessioneId);
    const ultima = await db.righe
      .where('[sessioneId+ordine]')
      .between([sessioneId, -Infinity], [sessioneId, Infinity])
      .last();
    const riga: Riga = {
      id: generaId(),
      sessioneId,
      codiceProdotto: dati.codiceProdotto,
      quantita: arrotondaQuantita(dati.quantita),
      lettaIl: adesso.toISOString(),
      ordine: (ultima?.ordine ?? 0) + 1,
      ...(dati.barcodeLetto ? { barcodeLetto: dati.barcodeLetto } : {}),
    };
    await db.righe.add(riga);
    return riga;
  });
}

/** Cambia la quantità di una riga di una sessione aperta. */
export async function modificaQuantita(
  db: DatabaseTerminalino,
  rigaId: string,
  quantita: number,
): Promise<void> {
  controllaQuantita(quantita);
  await db.transaction('rw', db.sessioni, db.righe, async () => {
    const riga = await db.righe.get(rigaId);
    if (!riga) throw new ErroreSessione('Riga non trovata.');
    await sessioneAperta(db, riga.sessioneId);
    await db.righe.update(rigaId, { quantita: arrotondaQuantita(quantita) });
  });
}

/** Cancella una riga di una sessione aperta. */
export async function cancellaRiga(db: DatabaseTerminalino, rigaId: string): Promise<void> {
  await db.transaction('rw', db.sessioni, db.righe, async () => {
    const riga = await db.righe.get(rigaId);
    if (!riga) return;
    await sessioneAperta(db, riga.sessioneId);
    await db.righe.delete(rigaId);
  });
}

/** Totale corrente di un prodotto nella sessione, somma di tutte le sue righe. */
export async function totaleProdotto(
  db: DatabaseTerminalino,
  sessioneId: string,
  codiceProdotto: string,
): Promise<number> {
  const righe = await db.righe.where('sessioneId').equals(sessioneId).toArray();
  return arrotondaQuantita(
    righe
      .filter((riga) => riga.codiceProdotto === codiceProdotto)
      .reduce((somma, riga) => somma + riga.quantita, 0),
  );
}

/**
 * Chiude una sessione aperta e mette in `codaUpload` il suo invio al bridge (una sola voce per
 * sessione). L'invio vero lo fa il servizio della coda.
 */
export async function chiudiSessione(
  db: DatabaseTerminalino,
  id: string,
  adesso: Date = new Date(),
): Promise<void> {
  await db.transaction('rw', db.sessioni, db.righe, db.codaUpload, async () => {
    const sessione = await db.sessioni.get(id);
    if (!sessione) throw new ErroreSessione('Sessione non trovata.');
    // `transizioneStato` ammette anche esportata → chiusa, ma quella la fa il bridge (T08):
    // dal telefono si chiude solo una sessione aperta.
    if (sessione.stato !== 'aperta' || !transizioneStato(sessione.stato, 'chiusa')) {
      throw new ErroreSessione('La sessione non è aperta.');
    }
    // Il bridge rifiuta i DDT senza cliente: Easyfatt non saprebbe a chi intestare l'ordine.
    if (sessione.tipo === 'ddt' && sessione.cliente === undefined) {
      throw new ErroreSessione(`${MANCA_CLIENTE} Senza cliente il DDT non si può chiudere.`);
    }
    // Il bridge rifiuta le sessioni senza righe: meglio dirlo subito che lasciarle in coda.
    if ((await db.righe.where('sessioneId').equals(id).count()) === 0) {
      throw new ErroreSessione('La sessione è vuota: aggiungi almeno una riga prima di chiuderla.');
    }
    const istante = adesso.toISOString();
    await db.sessioni.update(id, { stato: 'chiusa', chiusaIl: istante });
    const inCoda = await db.codaUpload
      .where('tipo')
      .equals('sessione')
      .filter((voce) => voce.riferimento === id)
      .first();
    if (!inCoda) {
      await db.codaUpload.add({
        tipo: 'sessione',
        riferimento: id,
        creataIl: istante,
        tentativi: 0,
      });
    }
  });
}

/**
 * Riapre una sessione chiusa. Se l'invio era ancora in coda lo toglie: la sessione sarà
 * rispedita alla prossima chiusura, con le righe aggiornate.
 */
export async function riapriSessione(db: DatabaseTerminalino, id: string): Promise<void> {
  await db.transaction('rw', db.sessioni, db.codaUpload, async () => {
    const sessione = await db.sessioni.get(id);
    if (!sessione) throw new ErroreSessione('Sessione non trovata.');
    if (!transizioneStato(sessione.stato, 'aperta')) {
      throw new ErroreSessione('Si può riaprire solo una sessione chiusa, non ancora esportata.');
    }
    await db.sessioni.update(id, { stato: 'aperta', chiusaIl: undefined });
    await db.codaUpload
      .where('tipo')
      .equals('sessione')
      .filter((voce) => voce.riferimento === id)
      .delete();
  });
}

/** Sessione con le righe in ordine, nella forma di `POST /api/sessioni`. */
export async function sessioneCompleta(
  db: DatabaseTerminalino,
  id: string,
): Promise<Sessione | undefined> {
  const sessione = await db.sessioni.get(id);
  if (!sessione) return undefined;
  // `inviataIl` è un'annotazione del telefono: il bridge non la conosce.
  const daSpedire: SessioneLocale = { ...sessione };
  delete daSpedire.inviataIl;
  return { ...daSpedire, righe: await righeSessione(db, id) };
}

/** Cancella sessione, righe e invio in coda dal solo telefono, senza controlli. */
async function cancellaSoloSulTelefono(db: DatabaseTerminalino, id: string): Promise<void> {
  await db.transaction('rw', db.sessioni, db.righe, db.codaUpload, async () => {
    await db.righe.where('sessioneId').equals(id).delete();
    await db.codaUpload
      .where('tipo')
      .equals('sessione')
      .filter((voce) => voce.riferimento === id)
      .delete();
    await db.sessioni.delete(id);
  });
}

/**
 * Cancella dal telefono una sessione che il bridge non ha mai ricevuto: aperta oppure chiusa con
 * l'invio ancora in coda. Una sessione già arrivata al bridge passa da
 * {@link cancellaSessioneOvunque}, altrimenti il PC continuerebbe a vederla.
 */
export async function cancellaSessione(db: DatabaseTerminalino, id: string): Promise<void> {
  await db.transaction('rw', db.sessioni, db.righe, db.codaUpload, async () => {
    const sessione = await db.sessioni.get(id);
    if (!sessione) return;
    if (sessione.inviataIl !== undefined) {
      throw new ErroreSessione(
        'La sessione è già sul bridge: va cancellata anche lì, serve la connessione.',
      );
    }
    await cancellaSoloSulTelefono(db, id);
  });
}

/**
 * Cancella una sessione ovunque sia (docs/DECISIONI.md punto 57). Se il bridge non l'ha mai
 * ricevuta (`inviataIl` assente) basta il telefono. Altrimenti chiama `DELETE /api/sessioni/:id`:
 * con `204` cancella anche sul telefono; con `404` il bridge non l'ha più e si cancella lo stesso;
 * con `409` Easyfatt l'ha già scaricata e l'errore riporta il messaggio del bridge. Senza rete o
 * con altri errori la sessione resta dov'è.
 */
export async function cancellaSessioneOvunque(
  db: DatabaseTerminalino,
  connessione: Connessione,
  id: string,
  recupera: typeof fetch = fetch,
): Promise<void> {
  const sessione = await db.sessioni.get(id);
  if (!sessione) return;
  if (sessione.inviataIl === undefined) {
    await cancellaSessione(db, id);
    return;
  }
  try {
    await chiamaBridge(
      connessione,
      `/api/sessioni/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
      recupera,
    );
  } catch (errore) {
    if (errore instanceof ErroreBridge && errore.stato === 404) {
      await cancellaSoloSulTelefono(db, id);
      return;
    }
    if (errore instanceof ErroreBridge && errore.stato === 409) {
      throw new ErroreSessione(
        errore.dettaglio ?? 'Easyfatt ha già scaricato la sessione: non si può più cancellare.',
      );
    }
    throw new ErroreSessione(`Sessione non cancellata. ${messaggioErrore(errore)}`);
  }
  await cancellaSoloSulTelefono(db, id);
}

/** Sessioni importate da più di {@link GIORNI_CONSERVAZIONE_IMPORTATE} giorni. */
export async function sessioniDaPulire(
  db: DatabaseTerminalino,
  adesso: Date = new Date(),
): Promise<SessioneLocale[]> {
  const limite = adesso.getTime() - GIORNI_CONSERVAZIONE_IMPORTATE * 24 * 60 * 60 * 1000;
  return db.sessioni
    .where('stato')
    .equals('importata')
    .filter((sessione) => Date.parse(sessione.chiusaIl ?? sessione.creataIl) < limite)
    .toArray();
}

/** Cancella dal telefono le sessioni importate più vecchie di 90 giorni, con righe e voci in coda. */
export async function pulisciSessioniImportate(
  db: DatabaseTerminalino,
  adesso: Date = new Date(),
): Promise<number> {
  return db.transaction('rw', db.sessioni, db.righe, db.codaUpload, async () => {
    const vecchie = await sessioniDaPulire(db, adesso);
    const id = vecchie.map((sessione) => sessione.id);
    if (id.length === 0) return 0;
    await db.righe.where('sessioneId').anyOf(id).delete();
    await db.codaUpload
      .where('tipo')
      .equals('sessione')
      .filter((voce) => id.includes(voce.riferimento))
      .delete();
    await db.sessioni.bulkDelete(id);
    return id.length;
  });
}
