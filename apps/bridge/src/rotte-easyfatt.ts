import { Hono } from 'hono';
import { analizzaCatalogo, ErroreCatalogo, generaDocumentiVuoto } from '@terminalinobru/easyfatt';
import type { Contesto } from './ambiente.js';
import { autenticaEasyfatt } from './autenticazione.js';
import { istanteInvio, salvaCatalogo } from './catalogo-db.js';

/**
 * Rotte usate dal modulo e-commerce di Easyfatt. Le risposte sono sempre testo puro: qualsiasi
 * corpo diverso da `OK` viene mostrato all'utente dentro Easyfatt come messaggio di errore
 * (docs/PROTOCOLLI-DANEA.md sezione 2.1), quindi devono essere frasi leggibili in italiano.
 */
export const rotteEasyfatt = new Hono<Contesto>();

/** Risposta di testo puro con la codifica dichiarata. */
function testo(corpo: string, stato: 200 | 400): Response {
  return new Response(corpo, {
    status: stato,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}

rotteEasyfatt.use('*', autenticaEasyfatt);

/** Riceve il catalogo `EasyfattProducts` nel campo multipart `file` e lo salva su D1. */
rotteEasyfatt.post('/catalogo', async (c) => {
  let modulo: FormData;
  try {
    modulo = await c.req.raw.formData();
  } catch {
    return testo(
      'Richiesta non valida: il catalogo va inviato come multipart/form-data nel campo «file».',
      400,
    );
  }

  const campo = modulo.get('file');
  if (campo === null) {
    return testo('Campo «file» mancante: nessun catalogo da leggere nella richiesta.', 400);
  }
  const xml = typeof campo === 'string' ? campo : await campo.text();

  const tenant = c.get('tenant');
  const aggiornatoIl = istanteInvio(new Date().toISOString(), tenant.ultimo_catalogo_il);

  let catalogo;
  try {
    catalogo = analizzaCatalogo(xml, { aggiornatoIl });
  } catch (errore) {
    if (errore instanceof ErroreCatalogo) return testo(errore.message, 400);
    throw errore;
  }

  try {
    await salvaCatalogo(c.env.DB, tenant.id, catalogo, aggiornatoIl);
  } catch (errore) {
    // Il messaggio di D1 non è comprensibile per chi usa Easyfatt e non va mostrato: resta nei log.
    console.error('Salvataggio del catalogo non riuscito', errore);
    return testo(
      'Errore nel salvataggio del catalogo sul bridge: il catalogo precedente non è stato modificato. Riprova fra qualche minuto.',
      400,
    );
  }

  return testo('OK', 200);
});

/** Polling dei documenti: in v1 risponde sempre un `EasyfattDocuments` vuoto. */
rotteEasyfatt.get(
  '/documenti',
  () =>
    new Response(generaDocumentiVuoto(), {
      status: 200,
      headers: { 'content-type': 'application/xml; charset=utf-8' },
    }),
);
