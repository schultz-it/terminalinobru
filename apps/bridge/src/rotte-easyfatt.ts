import { Hono } from 'hono';
import { aggregaRighe } from '@terminalinobru/core';
import type { ClienteDocumento } from '@terminalinobru/core';
import {
  analizzaCatalogo,
  analizzaParametriRicezione,
  ErroreCatalogo,
  ErroreDocumenti,
  ErroreRicezione,
  generaDocumentiXml,
} from '@terminalinobru/easyfatt';
import type { DocumentoOrdine } from '@terminalinobru/easyfatt';
import type { Contesto } from './ambiente.js';
import { autenticaEasyfatt } from './autenticazione.js';
import { descrizioniProdotti, istanteInvio, salvaCatalogo } from './catalogo-db.js';
import {
  righeDiSessioni,
  sessioniDdtCandidate,
  statementSegnaEsportate,
  statementSegnaImportatePrimaDi,
} from './ricezione-db.js';

/**
 * Rotte usate dal modulo e-commerce di Easyfatt. Le risposte sono sempre testo puro: qualsiasi
 * corpo diverso da `OK` viene mostrato all'utente dentro Easyfatt come messaggio di errore
 * (docs/PROTOCOLLI-DANEA.md sezione 2.1), quindi devono essere frasi leggibili in italiano.
 */
export const rotteEasyfatt = new Hono<Contesto>();

/** Fuso orario in cui si legge la data di chiusura delle sessioni (docs/DECISIONI.md punto 60). */
const FUSO_ORARIO = 'Europe/Rome';

/** Risposta di testo puro con la codifica dichiarata. */
function testo(corpo: string, stato: 200 | 400): Response {
  return new Response(corpo, {
    status: stato,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}

/** Data `yyyy-mm-dd` di un istante ISO, nel fuso orario indicato. */
function dataLocale(iso: string, fusoOrario: string): string {
  const parti = new Intl.DateTimeFormat('en-GB', {
    timeZone: fusoOrario,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(iso));
  const parte = (tipo: string) => parti.find((p) => p.type === tipo)?.value;
  return `${parte('year')}-${parte('month')}-${parte('day')}`;
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

/**
 * Polling dei documenti (v2): risponde con le sessioni ddt del tenant come ordini cliente,
 * filtrate su `firstnum`/`lastnum`/`firstdate`/`lastdate`. La prima consegna segna la sessione
 * `esportata`; le sessioni con numero minore di `firstnum` ancora `esportata` passano a
 * `importata` (docs/DECISIONI.md punto 53).
 */
rotteEasyfatt.get('/documenti', async (c) => {
  const tenant = c.get('tenant');
  const query = Object.fromEntries(new URL(c.req.url).searchParams.entries());

  let parametri;
  try {
    parametri = analizzaParametriRicezione(query);
  } catch (errore) {
    if (errore instanceof ErroreRicezione) return testo(errore.message, 400);
    throw errore;
  }

  // Serve al collaudo: si vede in log con quali parametri Easyfatt sta chiamando.
  console.log('GET /easyfatt/documenti', { tenant: tenant.id, ...parametri });

  const candidate = await sessioniDdtCandidate(
    c.env.DB,
    tenant.id,
    parametri.firstnum,
    parametri.lastnum,
  );
  const filtrate = candidate.filter((riga) => {
    const data = dataLocale(riga.chiusa_il, FUSO_ORARIO);
    if (parametri.firstdate !== undefined && data < parametri.firstdate) return false;
    if (parametri.lastdate !== undefined && data > parametri.lastdate) return false;
    return true;
  });

  // Una sessione ddt senza cliente non può capitare per quelle create dopo questo task (il
  // cliente è obbligatorio in POST /api/sessioni): resta possibile solo per ddt di v1, mai
  // passate dalla ricezione e-commerce. Si scartano con un avviso invece di rompere l'intero giro.
  const consegnabili = filtrate.filter((riga) => {
    if (riga.cliente !== null) return true;
    console.warn(`Sessione ${riga.id} senza cliente: esclusa dalla ricezione documenti.`);
    return false;
  });

  const righePerSessione = await righeDiSessioni(
    c.env.DB,
    consegnabili.map((riga) => riga.id),
  );
  const tuttiCodici = [...righePerSessione.values()].flat().map((riga) => riga.codice_prodotto);
  const descrizioni = await descrizioniProdotti(c.env.DB, tenant.id, tuttiCodici);

  const documenti: DocumentoOrdine[] = consegnabili.map((riga) => {
    const cliente = JSON.parse(riga.cliente as string) as ClienteDocumento;
    const righeGrezze = (righePerSessione.get(riga.id) ?? []).map((r) => ({
      codiceProdotto: r.codice_prodotto,
      quantita: r.quantita,
      ordine: r.ordine,
    }));
    const aggregate = aggregaRighe(righeGrezze);
    return {
      numero: riga.numero_documento,
      data: new Date(riga.chiusa_il),
      cliente,
      righe: aggregate.map((r) => {
        const descrizione = descrizioni.get(r.codice);
        return {
          codice: r.codice,
          quantita: r.quantita,
          ...(descrizione === undefined ? {} : { descrizione }),
        };
      }),
    };
  });

  let xml: string;
  try {
    xml = generaDocumentiXml(documenti);
  } catch (errore) {
    if (errore instanceof ErroreDocumenti) return testo(errore.message, 400);
    throw errore;
  }

  const adesso = new Date().toISOString();
  const daEsportare = consegnabili.filter((riga) => riga.stato === 'chiusa').map((riga) => riga.id);
  const statement = [
    ...statementSegnaEsportate(c.env.DB, daEsportare, adesso),
    ...(parametri.firstnum === undefined
      ? []
      : [statementSegnaImportatePrimaDi(c.env.DB, tenant.id, parametri.firstnum, adesso)]),
  ];
  if (statement.length > 0) await c.env.DB.batch(statement);

  return new Response(xml, {
    status: 200,
    headers: { 'content-type': 'application/xml; charset=utf-8' },
  });
});
