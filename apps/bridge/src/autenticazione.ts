import type { MiddlewareHandler } from 'hono';
import type { Contesto, Tenant } from './ambiente.js';

/** Hash fittizio usato quando l'utente non esiste, per non rivelare la differenza nei tempi. */
const HASH_FITTIZIO = '0'.repeat(64);

const COLONNE_TENANT =
  'id, nome, easyfatt_utente, easyfatt_password_hash, token_app_hash, ' +
  'stringa_formato, separatore_decimale, ultimo_catalogo_il, creato_il';

/** Calcola lo SHA-256 di una stringa e lo restituisce in esadecimale minuscolo. */
export async function hashSha256(valore: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(valore));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Confronta due stringhe in tempo costante rispetto al contenuto. La lunghezza non è un segreto:
 * i valori confrontati sono sempre hash esadecimali di 64 caratteri.
 */
export function confrontoCostante(primo: string, secondo: string): boolean {
  if (primo.length !== secondo.length) return false;
  let differenza = 0;
  for (let indice = 0; indice < primo.length; indice += 1) {
    differenza |= primo.charCodeAt(indice) ^ secondo.charCodeAt(indice);
  }
  return differenza === 0;
}

/** Decodifica base64 in testo UTF-8, o restituisce undefined se la stringa non è base64. */
function decodificaBase64(valore: string): string | undefined {
  try {
    const binario = atob(valore.trim());
    const byte = new Uint8Array(binario.length);
    for (let indice = 0; indice < binario.length; indice += 1) {
      byte[indice] = binario.charCodeAt(indice);
    }
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(byte);
  } catch {
    return undefined;
  }
}

/** Credenziali estratte dagli header della richiesta di Easyfatt. */
export interface CredenzialiBase {
  utente: string;
  password: string;
}

/**
 * Estrae utente e password da `Authorization: Basic ...` oppure dagli header alternativi
 * `HTTP_X_AUTHORIZATION` e `X-Authorization` usati dal modulo e-commerce di Easyfatt, che
 * contengono il base64 di `utente:password` con o senza il prefisso `Basic`.
 */
export function leggiCredenzialiBase(intestazioni: Headers): CredenzialiBase | undefined {
  const candidati = [
    intestazioni.get('authorization'),
    intestazioni.get('http_x_authorization'),
    intestazioni.get('x-authorization'),
  ];
  for (const candidato of candidati) {
    if (candidato === null || candidato.trim() === '') continue;
    const senzaPrefisso = candidato.replace(/^Basic\s+/i, '').trim();
    const decodificato = decodificaBase64(senzaPrefisso);
    if (decodificato === undefined) continue;
    const separatore = decodificato.indexOf(':');
    if (separatore < 1) continue;
    return {
      utente: decodificato.slice(0, separatore),
      password: decodificato.slice(separatore + 1),
    };
  }
  return undefined;
}

/** Risposta 401 per Easyfatt: testo puro, mai JSON. */
function nonAutorizzatoEasyfatt(): Response {
  return new Response('Credenziali non valide', {
    status: 401,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'www-authenticate': 'Basic realm="TerminalinoBru", charset="UTF-8"',
    },
  });
}

/**
 * Autentica le richieste di Easyfatt (`/easyfatt/*`) con Basic auth o header equivalente,
 * confrontando gli hash a tempo costante.
 */
export const autenticaEasyfatt: MiddlewareHandler<Contesto> = async (c, next) => {
  const credenziali = leggiCredenzialiBase(c.req.raw.headers);
  if (credenziali === undefined) return nonAutorizzatoEasyfatt();

  const tenant = await c.env.DB.prepare(
    `SELECT ${COLONNE_TENANT} FROM tenant WHERE easyfatt_utente = ?1`,
  )
    .bind(credenziali.utente)
    .first<Tenant>();

  const atteso = tenant?.easyfatt_password_hash ?? HASH_FITTIZIO;
  const calcolato = await hashSha256(credenziali.password);
  if (tenant === null || tenant === undefined) {
    confrontoCostante(calcolato, atteso);
    return nonAutorizzatoEasyfatt();
  }
  if (!confrontoCostante(calcolato, atteso)) return nonAutorizzatoEasyfatt();

  c.set('tenant', tenant);
  await next();
  return undefined;
};

/** Autentica le richieste della PWA (`/api/*`) con `Authorization: Bearer <token>`. */
export const autenticaApp: MiddlewareHandler<Contesto> = async (c, next) => {
  const intestazione = c.req.header('authorization') ?? '';
  const corrispondenza = /^Bearer\s+(.+)$/i.exec(intestazione.trim());
  if (corrispondenza === null) return c.json({ errore: 'Token non valido' }, 401);

  const hash = await hashSha256(corrispondenza[1] as string);
  const tenant = await c.env.DB.prepare(
    `SELECT ${COLONNE_TENANT} FROM tenant WHERE token_app_hash = ?1`,
  )
    .bind(hash)
    .first<Tenant>();
  if (tenant === null || tenant === undefined) {
    return c.json({ errore: 'Token non valido' }, 401);
  }

  c.set('tenant', tenant);
  await next();
  return undefined;
};
