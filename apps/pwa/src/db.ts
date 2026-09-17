import Dexie, { type EntityTable } from 'dexie';
import type { Barcode, Prodotto, Riga, Sessione } from '@terminalinobru/core';

/** Voce della coda di invio al bridge (docs/MODELLO-DATI.md sezione 3). Usata da T06 e T07. */
export type VoceCodaUpload = {
  id?: number;
  tipo: 'sessione' | 'barcode';
  riferimento: string;
  creataIl: string;
  tentativi: number;
  ultimoErrore?: string;
};

/** Coppia chiave/valore dello store `impostazioni`. */
export type VoceImpostazione = {
  chiave: string;
  valore: unknown;
};

/** Sessione salvata sul telefono: le righe stanno nel loro store, non annidate. */
export type SessioneLocale = Omit<Sessione, 'righe'>;

/** Database IndexedDB dell'app, con gli store di docs/MODELLO-DATI.md sezione 3. */
export class DatabaseTerminalino extends Dexie {
  prodotti!: EntityTable<Prodotto, 'codice'>;
  barcode!: EntityTable<Barcode, 'barcode'>;
  sessioni!: EntityTable<SessioneLocale, 'id'>;
  righe!: EntityTable<Riga, 'id'>;
  codaUpload!: EntityTable<VoceCodaUpload, 'id'>;
  impostazioni!: EntityTable<VoceImpostazione, 'chiave'>;

  constructor(nome = 'terminalinobru') {
    super(nome);
    this.version(1).stores({
      prodotti: 'codice, aggiornatoIl',
      barcode: 'barcode, codiceProdotto',
      sessioni: 'id, stato, creataIl',
      righe: 'id, sessioneId, [sessioneId+ordine]',
      codaUpload: '++id, tipo',
      impostazioni: 'chiave',
    });
  }
}

/** Istanza unica usata dall'app. I test ne creano di proprie con nomi diversi. */
export const db = new DatabaseTerminalino();
