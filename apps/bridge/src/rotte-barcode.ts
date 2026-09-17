import { Hono } from 'hono';
import type { Contesto } from './ambiente.js';
import { autenticaApp } from './autenticazione.js';
import type { AbbinamentoDaSalvare } from './barcode-db.js';
import { abbinamentiApp, salvaAbbinamentiApp } from './barcode-db.js';

/** Rotte degli abbinamenti barcode creati in app, tutte dietro il token Bearer. */
export const rotteBarcode = new Hono<Contesto>();

rotteBarcode.use('*', autenticaApp);

/** Racchiude fra virgolette e raddoppia le virgolette interne se il campo contiene `;`, `"` o a capo. */
function campoCsv(valore: string): string {
  if (!/[;"\r\n]/.test(valore)) return valore;
  return `"${valore.replaceAll('"', '""')}"`;
}

/** Legge il corpo come array di `{ barcode, codiceProdotto }`, o `undefined` se non valido. */
function leggiAbbinamenti(corpo: unknown): AbbinamentoDaSalvare[] | undefined {
  if (!Array.isArray(corpo)) return undefined;
  const abbinamenti: AbbinamentoDaSalvare[] = [];
  for (const elemento of corpo) {
    if (typeof elemento !== 'object' || elemento === null) return undefined;
    const { barcode, codiceProdotto } = elemento as Record<string, unknown>;
    if (typeof barcode !== 'string' || barcode === '') return undefined;
    if (typeof codiceProdotto !== 'string' || codiceProdotto === '') return undefined;
    abbinamenti.push({ barcode, codiceProdotto });
  }
  return abbinamenti;
}

/** Salva gli abbinamenti barcode → prodotto creati in app. Non tocca chi è già di Easyfatt. */
rotteBarcode.post('/', async (c) => {
  let corpo: unknown;
  try {
    corpo = await c.req.json();
  } catch {
    return c.json({ errore: 'Corpo della richiesta non è JSON valido.' }, 400);
  }

  const abbinamenti = leggiAbbinamenti(corpo);
  if (abbinamenti === undefined) {
    return c.json(
      { errore: 'Corpo non valido: atteso un array di { barcode, codiceProdotto }.' },
      400,
    );
  }

  const tenant = c.get('tenant');
  await salvaAbbinamentiApp(c.env.DB, tenant.id, abbinamenti, new Date().toISOString());
  return c.body(null, 204);
});

/** CSV degli abbinamenti creati in app, da riportare in Easyfatt. */
rotteBarcode.get('/nuovi.csv', async (c) => {
  const tenant = c.get('tenant');
  const righe = await abbinamentiApp(c.env.DB, tenant.id);
  const corpo =
    'codice;barcode\r\n' +
    righe
      .map((riga) => `${campoCsv(riga.codice_prodotto)};${campoCsv(riga.barcode)}`)
      .join('\r\n') +
    (righe.length > 0 ? '\r\n' : '');
  return c.body(corpo, 200, { 'content-type': 'text/csv; charset=utf-8' });
});
