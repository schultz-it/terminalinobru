import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import worker from '../src/index.js';
import { hashSha256 } from '../src/autenticazione.js';

/** Credenziali di un tenant creato per i test. */
export interface TenantDiProva {
  id: string;
  nome: string;
  utente: string;
  password: string;
  token: string;
}

/** Inserisce un tenant con password e token noti, restituendo i valori in chiaro. */
export async function creaTenant(indice = 1): Promise<TenantDiProva> {
  const tenant: TenantDiProva = {
    id: `tenant-${indice}`,
    nome: `Azienda ${indice}`,
    utente: `easyfatt${indice}`,
    password: `password-${indice}`,
    token: `token-${indice}`,
  };
  await env.DB.prepare(
    `INSERT INTO tenant (id, nome, easyfatt_utente, easyfatt_password_hash, token_app_hash, creato_il)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
  )
    .bind(
      tenant.id,
      tenant.nome,
      tenant.utente,
      await hashSha256(tenant.password),
      await hashSha256(tenant.token),
      '2026-01-01T00:00:00.000Z',
    )
    .run();
  return tenant;
}

/** Esegue una richiesta contro il Worker, aspettando anche il lavoro differito. */
export async function chiama(richiesta: Request): Promise<Response> {
  const ctx = createExecutionContext();
  const risposta = await worker.fetch(richiesta, env, ctx);
  await waitOnExecutionContext(ctx);
  return risposta;
}

/** Valore dell'header `Authorization: Basic` per le credenziali indicate. */
export function basic(utente: string, password: string): string {
  return `Basic ${btoa(`${utente}:${password}`)}`;
}

/** Invia un catalogo come farebbe Easyfatt: multipart con il campo `file`. */
export async function inviaCatalogo(
  tenant: TenantDiProva,
  xml: string,
  intestazioni: Record<string, string> = { authorization: '' },
): Promise<Response> {
  const modulo = new FormData();
  modulo.append('file', new File([xml], 'catalogo.xml', { type: 'text/xml' }));
  const finali =
    intestazioni.authorization === ''
      ? { authorization: basic(tenant.utente, tenant.password) }
      : intestazioni;
  return chiama(
    new Request('http://localhost/easyfatt/catalogo', {
      method: 'POST',
      body: modulo,
      headers: finali,
    }),
  );
}

/** Chiama una rotta `/api` con il token Bearer del tenant. */
export async function chiamaApi(percorso: string, token: string | null): Promise<Response> {
  const intestazioni: Record<string, string> = {};
  if (token !== null) intestazioni['authorization'] = `Bearer ${token}`;
  return chiama(new Request(`http://localhost${percorso}`, { headers: intestazioni }));
}
