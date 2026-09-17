import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import type { Cliente, ClienteDocumento, Sessione } from '@terminalinobru/core';
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

/** Chiama una rotta `/api` senza corpo, con il metodo indicato e il token Bearer del tenant. */
export async function chiamaApiMetodo(
  metodo: 'DELETE',
  percorso: string,
  token: string | null,
): Promise<Response> {
  const intestazioni: Record<string, string> = {};
  if (token !== null) intestazioni['authorization'] = `Bearer ${token}`;
  return chiama(
    new Request(`http://localhost${percorso}`, { method: metodo, headers: intestazioni }),
  );
}

/** Chiama una rotta `/api` con corpo JSON, il metodo indicato e il token Bearer del tenant. */
export async function chiamaApiConCorpo(
  metodo: 'POST' | 'PATCH',
  percorso: string,
  token: string | null,
  corpo: unknown,
): Promise<Response> {
  const intestazioni: Record<string, string> = { 'content-type': 'application/json' };
  if (token !== null) intestazioni['authorization'] = `Bearer ${token}`;
  return chiama(
    new Request(`http://localhost${percorso}`, {
      method: metodo,
      headers: intestazioni,
      body: JSON.stringify(corpo),
    }),
  );
}

/** Sessione chiusa di prova, con due righe dello stesso prodotto da sommare all'export. */
export function sessioneDiProva(overrides: Partial<Sessione> = {}): Sessione {
  return {
    id: 'sessione-1',
    tipo: 'inventario',
    nome: 'Scaffale A',
    stato: 'chiusa',
    modalita: 'chiedi_quantita',
    creataIl: '2026-02-01T09:00:00.000Z',
    chiusaIl: '2026-02-01T09:10:00.000Z',
    righe: [
      {
        id: 'riga-1',
        sessioneId: 'sessione-1',
        codiceProdotto: 'ABC',
        quantita: 2,
        lettaIl: '2026-02-01T09:01:00.000Z',
        ordine: 0,
      },
      {
        id: 'riga-2',
        sessioneId: 'sessione-1',
        codiceProdotto: 'ABC',
        quantita: 3,
        lettaIl: '2026-02-01T09:02:00.000Z',
        ordine: 1,
      },
    ],
    ...overrides,
  };
}

/** Cliente di prova per i DDT. */
export function clienteDocumentoDiProva(
  overrides: Partial<ClienteDocumento> = {},
): ClienteDocumento {
  return {
    codice: 'C001',
    nome: 'Ceramiche Italiane',
    partitaIva: '03322350178',
    citta: 'Castiglione Del Lago',
    ...overrides,
  };
}

/** Sessione ddt chiusa di prova, con cliente e una riga. `id` è unico anche per le righe. */
export function sessioneDdtDiProva(overrides: Partial<Sessione> = {}): Sessione {
  const id = overrides.id ?? 'sessione-ddt-1';
  return sessioneDiProva({
    id,
    tipo: 'ddt',
    nome: 'Ordine 1',
    cliente: clienteDocumentoDiProva(),
    righe: [
      {
        id: `riga-${id}`,
        sessioneId: id,
        codiceProdotto: 'ABC',
        quantita: 4,
        lettaIl: '2026-02-01T09:01:00.000Z',
        ordine: 0,
      },
    ],
    ...overrides,
  });
}

/** Cliente di prova per l'importazione, con `id` uguale al codice Easyfatt. */
export function clienteDiProva(overrides: Partial<Cliente> = {}): Cliente {
  return {
    id: 'C001',
    origine: 'easyfatt',
    nome: 'Ceramiche Italiane',
    partitaIva: '03322350178',
    citta: 'Castiglione Del Lago',
    aggiornatoIl: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}
