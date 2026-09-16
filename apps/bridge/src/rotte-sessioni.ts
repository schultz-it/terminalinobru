import { Hono } from 'hono';
import { aggregaRighe, schemaSessione, transizioneStato } from '@terminalinobru/core';
import { ErroreFileTerminale, generaFileTerminale } from '@terminalinobru/easyfatt';
import type { Contesto } from './ambiente.js';
import { autenticaApp } from './autenticazione.js';
import type { SessioneDaSalvare } from './sessioni-db.js';
import {
  elencoSessioni,
  impostaStato,
  recuperaSessioneBase,
  recuperaSessioneConRighe,
  upsertSessione,
} from './sessioni-db.js';

/** Rotte delle sessioni di lavoro (inventario, DDT, carico), tutte dietro il token Bearer. */
export const rotteSessioni = new Hono<Contesto>();

/** Stati di sessione che il bridge conserva: le sessioni "aperta" restano solo sul telefono. */
const STATI_BRIDGE = new Set(['chiusa', 'esportata', 'importata']);

rotteSessioni.use('*', autenticaApp);

/** Minuscolo, senza accenti: forma di base per un nome file leggibile ovunque. */
function sanificaNomeFile(testo: string): string {
  const pulito = testo
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return pulito === '' ? 'sessione' : pulito;
}

/** Data odierna in formato `aaaammgg`, per il nome del file del terminalino. */
function dataOdierna(): string {
  const adesso = new Date();
  const anno = String(adesso.getUTCFullYear()).padStart(4, '0');
  const mese = String(adesso.getUTCMonth() + 1).padStart(2, '0');
  const giorno = String(adesso.getUTCDate()).padStart(2, '0');
  return `${anno}${mese}${giorno}`;
}

/** Crea o sostituisce una sessione chiusa con le sue righe. */
rotteSessioni.post('/', async (c) => {
  let corpo: unknown;
  try {
    corpo = await c.req.json();
  } catch {
    return c.json({ errore: 'Corpo della richiesta non è JSON valido.' }, 400);
  }

  const risultato = schemaSessione.safeParse(corpo);
  if (!risultato.success) {
    return c.json({ errore: 'Sessione non valida: verifica i campi obbligatori.' }, 400);
  }
  const sessione = risultato.data;

  if (sessione.stato !== 'chiusa') {
    return c.json({ errore: 'Il bridge accetta solo sessioni con stato «chiusa».' }, 400);
  }
  if (sessione.chiusaIl === undefined) {
    return c.json(
      { errore: 'Una sessione chiusa deve avere la data di chiusura «chiusaIl».' },
      400,
    );
  }
  if (sessione.righe === undefined || sessione.righe.length === 0) {
    return c.json({ errore: 'La sessione non contiene righe.' }, 400);
  }

  const daSalvare: SessioneDaSalvare = {
    id: sessione.id,
    tipo: sessione.tipo,
    nome: sessione.nome,
    modalita: sessione.modalita,
    creataIl: sessione.creataIl,
    chiusaIl: sessione.chiusaIl,
    righe: sessione.righe,
    ...(sessione.note === undefined ? {} : { note: sessione.note }),
    ...(sessione.dispositivo === undefined ? {} : { dispositivo: sessione.dispositivo }),
  };

  const tenant = c.get('tenant');
  const ricevutaIl = await upsertSessione(c.env.DB, tenant.id, daSalvare, new Date().toISOString());
  return c.json({ id: sessione.id, ricevutaIl }, 201);
});

/** Elenco delle sessioni del tenant, senza righe, con conteggio e somma delle quantità. */
rotteSessioni.get('/', async (c) => {
  const tenant = c.get('tenant');
  const stato = c.req.query('stato');
  if (stato !== undefined && !STATI_BRIDGE.has(stato)) {
    return c.json({ errore: `Stato «${stato}» non valido.` }, 400);
  }
  const elenco = await elencoSessioni(c.env.DB, tenant.id, stato);
  return c.json(elenco);
});

/** Dettaglio di una sessione con le righe in ordine. */
rotteSessioni.get('/:id', async (c) => {
  const tenant = c.get('tenant');
  const sessione = await recuperaSessioneConRighe(c.env.DB, tenant.id, c.req.param('id'));
  if (sessione === null) return c.json({ errore: 'Sessione non trovata.' }, 404);
  return c.json(sessione);
});

/** File del terminalino generato al volo dalle righe aggregate della sessione. */
rotteSessioni.get('/:id/terminale.txt', async (c) => {
  const tenant = c.get('tenant');
  const id = c.req.param('id');
  const soloAnteprima = c.req.query('soloAnteprima') === '1';

  const sessione = await recuperaSessioneConRighe(c.env.DB, tenant.id, id);
  if (sessione === null) return c.json({ errore: 'Sessione non trovata.' }, 404);

  const aggregate = aggregaRighe(sessione.righe);
  let testo: string;
  try {
    testo = generaFileTerminale(aggregate, {
      stringaFormato: tenant.stringa_formato,
      separatoreDecimale: tenant.separatore_decimale === ',' ? ',' : '.',
    });
  } catch (errore) {
    if (errore instanceof ErroreFileTerminale) return c.json({ errore: errore.message }, 400);
    throw errore;
  }

  if (!soloAnteprima && sessione.stato === 'chiusa') {
    await impostaStato(c.env.DB, tenant.id, id, 'esportata', new Date().toISOString());
  }

  const nomeFile = `terminale-${sessione.tipo}-${sanificaNomeFile(sessione.nome)}-${dataOdierna()}.txt`;
  return new Response(testo, {
    status: 200,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'content-disposition': `attachment; filename="${nomeFile}"`,
    },
  });
});

/** Cambia lo stato di una sessione: `chiusa → esportata → importata`. */
rotteSessioni.patch('/:id', async (c) => {
  const tenant = c.get('tenant');
  const id = c.req.param('id');

  let corpo: unknown;
  try {
    corpo = await c.req.json();
  } catch {
    return c.json({ errore: 'Corpo della richiesta non è JSON valido.' }, 400);
  }
  const nuovoStato =
    typeof corpo === 'object' && corpo !== null && 'stato' in corpo
      ? (corpo as { stato: unknown }).stato
      : undefined;
  if (typeof nuovoStato !== 'string') {
    return c.json({ errore: 'Campo «stato» mancante o non valido.' }, 400);
  }

  const attuale = await recuperaSessioneBase(c.env.DB, tenant.id, id);
  if (attuale === null) return c.json({ errore: 'Sessione non trovata.' }, 404);

  if (nuovoStato !== 'esportata' && nuovoStato !== 'importata') {
    return c.json(
      { errore: `Lo stato «${nuovoStato}» non è gestito dal bridge per questa sessione.` },
      409,
    );
  }
  if (!transizioneStato(attuale.stato, nuovoStato)) {
    return c.json(
      { errore: `Transizione di stato non ammessa: «${attuale.stato}» → «${nuovoStato}».` },
      409,
    );
  }

  const aggiornata = await impostaStato(
    c.env.DB,
    tenant.id,
    id,
    nuovoStato,
    new Date().toISOString(),
  );
  return c.json(aggiornata, 200);
});
