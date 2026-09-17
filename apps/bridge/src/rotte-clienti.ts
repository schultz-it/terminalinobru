import { Hono } from 'hono';
import { schemaCliente } from '@terminalinobru/core';
import type { Cliente } from '@terminalinobru/core';
import type { Contesto } from './ambiente.js';
import { autenticaApp } from './autenticazione.js';
import {
  clientiEliminatiDopo,
  clientiModificati,
  importaClienti,
  rigaACliente,
} from './clienti-db.js';

/** Rotte dei clienti (v2), tutte dietro il token Bearer. */
export const rotteClienti = new Hono<Contesto>();

rotteClienti.use('*', autenticaApp);

/** Oltre questo numero di byte il corpo dell'importazione non viene letto. */
export const LIMITE_BYTE_IMPORTAZIONE = 2 * 1024 * 1024;

/** Oltre questo numero di clienti l'importazione viene rifiutata. */
export const LIMITE_CLIENTI_IMPORTAZIONE = 5000;

/**
 * Sostituisce l'elenco clienti con quello già interpretato dalla PWA dall'export Excel/CSV di
 * Easyfatt: upsert a blocchi e tombstone per gli assenti, come il catalogo `full`.
 */
rotteClienti.post('/importa', async (c) => {
  const testo = await c.req.text();
  if (new TextEncoder().encode(testo).length > LIMITE_BYTE_IMPORTAZIONE) {
    return c.json(
      { errore: `Il corpo supera il limite di ${LIMITE_BYTE_IMPORTAZIONE} byte.` },
      413,
    );
  }

  let corpo: unknown;
  try {
    corpo = JSON.parse(testo);
  } catch {
    return c.json({ errore: 'Corpo della richiesta non è JSON valido.' }, 400);
  }

  const grezzi =
    typeof corpo === 'object' && corpo !== null && 'clienti' in corpo
      ? (corpo as { clienti: unknown }).clienti
      : undefined;
  if (!Array.isArray(grezzi)) {
    return c.json({ errore: 'Corpo non valido: atteso { clienti: Cliente[] }.' }, 400);
  }
  if (grezzi.length > LIMITE_CLIENTI_IMPORTAZIONE) {
    return c.json({ errore: `Massimo ${LIMITE_CLIENTI_IMPORTAZIONE} clienti per invio.` }, 413);
  }

  const clienti: Cliente[] = [];
  for (const [indice, elemento] of grezzi.entries()) {
    const esito = schemaCliente.safeParse(elemento);
    if (!esito.success) {
      // Chi carica il file deve poter trovare il cliente in Easyfatt: codice e primo errore.
      const id =
        typeof elemento === 'object' && elemento !== null && 'id' in elemento
          ? String((elemento as { id: unknown }).id)
          : `in posizione ${indice + 1}`;
      const problema = esito.error.issues[0];
      const campo = problema?.path.join('.') ?? '';
      return c.json(
        {
          errore: `Cliente ${id} non valido${campo === '' ? '' : ` (campo ${campo})`}: ${problema?.message ?? 'verifica i campi obbligatori.'}`,
        },
        400,
      );
    }
    clienti.push(esito.data);
  }

  const tenant = c.get('tenant');
  const esito = await importaClienti(c.env.DB, tenant.id, clienti, new Date().toISOString());
  return c.json(esito);
});

/** Clienti modificati dopo `dal`, con lo stesso cursore del catalogo. Senza `dal`, tutti. */
rotteClienti.get('/', async (c) => {
  const tenant = c.get('tenant');
  const dalGrezzo = c.req.query('dal');
  let dal: string | undefined;
  if (dalGrezzo !== undefined && dalGrezzo !== '') {
    if (Number.isNaN(Date.parse(dalGrezzo))) {
      return c.json({ errore: 'Parametro «dal» non valido: attesa una data ISO 8601.' }, 400);
    }
    dal = dalGrezzo;
  }

  const righe = await clientiModificati(c.env.DB, tenant.id, dal);
  const clientiEliminati =
    dal === undefined ? [] : await clientiEliminatiDopo(c.env.DB, tenant.id, dal);

  return c.json({
    aggiornatoIl: tenant.ultimo_clienti_il ?? new Date().toISOString(),
    clienti: righe.map(rigaACliente),
    clientiEliminati,
  });
});
