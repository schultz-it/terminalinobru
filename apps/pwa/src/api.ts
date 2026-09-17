import type { Impostazioni } from '@terminalinobru/core';
import { z } from 'zod';

/** Errore di dialogo con il bridge, con un messaggio già pronto per l'utente. */
export class ErroreBridge extends Error {
  constructor(
    messaggio: string,
    readonly stato?: number,
  ) {
    super(messaggio);
    this.name = 'ErroreBridge';
  }
}

/** Parametri di connessione al bridge presi dalle impostazioni. */
export type Connessione = Pick<Impostazioni, 'urlBridge' | 'token'>;

/**
 * Indirizzo completo di un percorso del bridge. Con URL vuoto si usa la stessa origine della PWA,
 * che in produzione è servita dal Worker stesso.
 */
export function indirizzoBridge(urlBridge: string, percorso: string): string {
  const base = urlBridge.trim().replace(/\/+$/, '');
  return `${base}${percorso}`;
}

function messaggioPerStato(stato: number): string {
  if (stato === 401 || stato === 403) {
    return 'Token non valido: controllalo nelle impostazioni.';
  }
  if (stato === 404) return "Il bridge non risponde a questo indirizzo: controlla l'URL.";
  if (stato >= 500) return `Il bridge ha avuto un problema (errore ${stato}). Riprova più tardi.`;
  return `Il bridge ha rifiutato la richiesta (errore ${stato}).`;
}

/**
 * Chiamata autenticata verso il bridge. Restituisce la risposta solo se ha codice 2xx; ogni
 * problema diventa un `ErroreBridge` con testo in italiano. Un errore senza `stato` vuol dire
 * che il bridge non è stato raggiunto (rete assente o indirizzo sbagliato).
 */
export async function chiamaBridge(
  connessione: Connessione,
  percorso: string,
  init: RequestInit = {},
  recupera: typeof fetch = fetch,
): Promise<Response> {
  if (connessione.token.trim() === '') {
    throw new ErroreBridge('Manca il token: inseriscilo nelle impostazioni.');
  }
  const intestazioni = new Headers(init.headers);
  intestazioni.set('Authorization', `Bearer ${connessione.token.trim()}`);
  intestazioni.set('Accept', 'application/json');
  let risposta: Response;
  try {
    risposta = await recupera(indirizzoBridge(connessione.urlBridge, percorso), {
      ...init,
      headers: intestazioni,
    });
  } catch {
    throw new ErroreBridge(
      "Bridge non raggiungibile: controlla la connessione e l'indirizzo nelle impostazioni.",
    );
  }
  if (!risposta.ok) {
    let dettaglio: string | undefined;
    try {
      const corpo: unknown = await risposta.json();
      const errore = z.object({ errore: z.string() }).safeParse(corpo);
      if (errore.success) dettaglio = errore.data.errore;
    } catch {
      // Corpo non JSON: basta il codice di stato.
    }
    const base = messaggioPerStato(risposta.status);
    throw new ErroreBridge(dettaglio ? `${base} ${dettaglio}` : base, risposta.status);
  }
  return risposta;
}

/** POST autenticato con corpo JSON. La risposta è restituita senza leggerne il corpo. */
export function inviaJsonAlBridge(
  connessione: Connessione,
  percorso: string,
  corpo: unknown,
  recupera: typeof fetch = fetch,
): Promise<Response> {
  return chiamaBridge(
    connessione,
    percorso,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    },
    recupera,
  );
}

/**
 * GET autenticato verso il bridge, con risposta JSON validata dallo schema.
 * Ogni problema diventa un `ErroreBridge` con testo in italiano.
 */
export async function richiestaBridge<T>(
  connessione: Connessione,
  percorso: string,
  schema: z.ZodType<T>,
  recupera: typeof fetch = fetch,
): Promise<T> {
  const risposta = await chiamaBridge(connessione, percorso, {}, recupera);
  let corpo: unknown;
  try {
    corpo = await risposta.json();
  } catch {
    throw new ErroreBridge(
      "Risposta del bridge non leggibile: l'indirizzo potrebbe non essere quello del bridge.",
    );
  }
  const esito = schema.safeParse(corpo);
  if (!esito.success) {
    throw new ErroreBridge('Risposta del bridge in un formato inatteso: aggiorna app e bridge.');
  }
  return esito.data;
}

/** Messaggio leggibile per qualsiasi errore catturato. */
export function messaggioErrore(errore: unknown): string {
  if (errore instanceof ErroreBridge) return errore.message;
  return 'Errore imprevisto. Riprova; se si ripete, riavvia l’app.';
}

const schemaStato = z.object({
  nome: z.string(),
  ultimoCatalogoIl: z.string().nullable(),
  prodotti: z.number(),
});

/** Risposta di `GET /api/stato`. */
export type StatoBridge = z.output<typeof schemaStato>;

/** Chiama `GET /api/stato` per la verifica di connessione. */
export function leggiStatoBridge(
  connessione: Connessione,
  recupera: typeof fetch = fetch,
): Promise<StatoBridge> {
  return richiestaBridge(connessione, '/api/stato', schemaStato, recupera);
}
