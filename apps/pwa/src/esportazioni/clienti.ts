import type { Cliente } from '@terminalinobru/core';
import {
  analizzaClientiTabella,
  ErroreTabellaClienti,
  leggiCsv,
  type TabellaClienti,
} from '@terminalinobru/easyfatt';
import { z } from 'zod';
import { inviaJsonAlBridge, type Connessione } from '../api.js';
import { ErroreXlsx, leggiXlsx } from './xlsx.js';

/** Errore di lettura dell'export clienti, con messaggio in italiano da mostrare così com'è. */
export class ErroreFileClienti extends Error {
  constructor(messaggio: string) {
    super(messaggio);
    this.name = 'ErroreFileClienti';
  }
}

/** Il file scelto nell'input: basta nome e contenuto, così i test non servono un `File` vero. */
export type FileClienti = { name: string; arrayBuffer: () => Promise<ArrayBuffer> };

/** Il testo di un CSV: UTF-8 se valido, altrimenti Windows-1252 (Excel italiano salva così). */
function testoCsv(byte: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(byte);
  } catch {
    return new TextDecoder('windows-1252').decode(byte);
  }
}

/**
 * Legge l'export clienti di Easyfatt (Soggetti.xlsx, oppure un CSV) e lo interpreta con
 * `analizzaClientiTabella`. L'estensione decide il formato; un .xlsx inizia sempre con la firma
 * degli zip (`PK`), che fa da ripiego se il nome non ha estensione.
 */
export async function leggiFileClienti(
  file: FileClienti,
  adesso: Date = new Date(),
): Promise<TabellaClienti> {
  const byte = new Uint8Array(await file.arrayBuffer());
  const nome = file.name.toLowerCase();
  const zip = byte[0] === 0x50 && byte[1] === 0x4b;
  try {
    let tabella: string[][];
    if (nome.endsWith('.xlsx') || (!nome.endsWith('.csv') && zip)) tabella = leggiXlsx(byte);
    else if (nome.endsWith('.csv')) tabella = leggiCsv(testoCsv(byte));
    else throw new ErroreFileClienti('Scegli il file .xlsx esportato da Easyfatt, oppure un .csv.');
    return analizzaClientiTabella(tabella, { aggiornatoIl: adesso.toISOString() });
  } catch (errore) {
    if (errore instanceof ErroreXlsx || errore instanceof ErroreTabellaClienti) {
      throw new ErroreFileClienti(errore.message);
    }
    throw errore;
  }
}

const schemaEsitoImportazione = z.object({ importati: z.number(), eliminati: z.number() });

/** Risposta di `POST /api/clienti/importa`. */
export type EsitoImportazioneClienti = z.output<typeof schemaEsitoImportazione>;

/** Manda al bridge i clienti già interpretati: sostituiscono l'elenco precedente. */
export async function importaClientiNelBridge(
  connessione: Connessione,
  clienti: readonly Cliente[],
  recupera: typeof fetch = fetch,
): Promise<EsitoImportazioneClienti> {
  const risposta = await inviaJsonAlBridge(
    connessione,
    '/api/clienti/importa',
    { clienti },
    recupera,
  );
  const esito = schemaEsitoImportazione.safeParse(await risposta.json().catch(() => undefined));
  // L'importazione è comunque riuscita (2xx): senza conteggi si mostra quello che si è mandato.
  return esito.success ? esito.data : { importati: clienti.length, eliminati: 0 };
}
