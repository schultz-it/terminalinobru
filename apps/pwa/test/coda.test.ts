import { afterEach, describe, expect, it } from 'vitest';
import type { DatabaseTerminalino } from '../src/db.js';
import { salvaImpostazioni } from '../src/impostazioni.js';
import { abbinaBarcode } from '../src/scanner/risolvi.js';
import {
  aggiungiRiga,
  chiudiSessione,
  creaSessione,
  riapriSessione,
} from '../src/sessioni/operazioni.js';
import { avviaServizioCoda, creaServizioCoda, svuotaCoda } from '../src/sync/coda.js';
import { fetchFinto, nuovoDb, prodotto } from './aiuti.js';

const connessione = { urlBridge: 'https://bridge.esempio.it', token: 'segreto' };
const chiusura = new Date('2026-09-17T09:00:00.000Z');

let db: DatabaseTerminalino;
afterEach(async () => {
  await db?.delete();
});

async function sessioneChiusa(nome = 'Scaffale A') {
  const sessione = await creaSessione(db, {
    tipo: 'inventario',
    nome,
    modalita: 'chiedi_quantita',
  });
  await aggiungiRiga(db, sessione.id, { codiceProdotto: 'A1', quantita: 3, barcodeLetto: '8001' });
  await aggiungiRiga(db, sessione.id, { codiceProdotto: 'B2', quantita: 1.5 });
  await chiudiSessione(db, sessione.id, chiusura);
  return sessione;
}

const creata = () =>
  Response.json({ id: 'x', ricevutaIl: '2026-09-17T09:00:01Z' }, { status: 201 });

describe('svuotaCoda', () => {
  it('se il bridge non risponde tiene la voce, poi al tentativo riuscito la invia e la toglie', async () => {
    db = nuovoDb();
    const sessione = await sessioneChiusa();
    const { recupera, chiamate } = fetchFinto(new TypeError('Failed to fetch'), creata());

    const primo = await svuotaCoda({ db, impostazioni: connessione, recupera });
    expect(primo).toEqual({
      inviate: 0,
      rimaste: 1,
      errore:
        "Bridge non raggiungibile: controlla la connessione e l'indirizzo nelle impostazioni.",
    });
    expect(await db.codaUpload.toArray()).toMatchObject([
      { tipo: 'sessione', riferimento: sessione.id, tentativi: 1, ultimoErrore: primo.errore },
    ]);

    const secondo = await svuotaCoda({ db, impostazioni: connessione, recupera });
    expect(secondo).toEqual({ inviate: 1, rimaste: 0 });
    expect(chiamate).toHaveLength(2);

    const invio = chiamate[1]!;
    expect(invio.url).toBe('https://bridge.esempio.it/api/sessioni');
    expect(invio.init?.method).toBe('POST');
    const intestazioni = new Headers(invio.init?.headers);
    expect(intestazioni.get('Authorization')).toBe('Bearer segreto');
    expect(intestazioni.get('Content-Type')).toBe('application/json');
    expect(JSON.parse(String(invio.init?.body))).toMatchObject({
      id: sessione.id,
      tipo: 'inventario',
      nome: 'Scaffale A',
      stato: 'chiusa',
      chiusaIl: chiusura.toISOString(),
      righe: [
        { codiceProdotto: 'A1', quantita: 3, barcodeLetto: '8001', ordine: 1 },
        { codiceProdotto: 'B2', quantita: 1.5, ordine: 2 },
      ],
    });

    // Coda vuota: un altro giro non chiama più il bridge.
    expect(await svuotaCoda({ db, impostazioni: connessione, recupera })).toEqual({
      inviate: 0,
      rimaste: 0,
    });
    expect(chiamate).toHaveLength(2);
  });

  it('se il bridge rifiuta una sessione annota l’errore e passa alla successiva', async () => {
    db = nuovoDb();
    const prima = await sessioneChiusa('Prima');
    const seconda = await sessioneChiusa('Seconda');
    const { recupera, chiamate } = fetchFinto(
      Response.json({ errore: 'La sessione non contiene righe.' }, { status: 400 }),
      creata(),
    );

    const esito = await svuotaCoda({ db, impostazioni: connessione, recupera });
    expect(esito.inviate).toBe(1);
    expect(esito.rimaste).toBe(1);
    expect(chiamate).toHaveLength(2);
    const [rimasta] = await db.codaUpload.toArray();
    expect(rimasta).toMatchObject({ riferimento: prima.id, tentativi: 1 });
    expect(rimasta?.ultimoErrore).toContain('La sessione non contiene righe.');
    expect(JSON.parse(String(chiamate[1]?.init?.body)).id).toBe(seconda.id);
  });

  it('senza token non chiama il bridge e lascia tutto in coda', async () => {
    db = nuovoDb();
    await sessioneChiusa();
    const { recupera, chiamate } = fetchFinto();
    const esito = await svuotaCoda({ db, impostazioni: { urlBridge: '', token: '' }, recupera });
    expect(esito).toMatchObject({ inviate: 0, rimaste: 1 });
    expect(esito.errore).toContain('Manca il token');
    expect(chiamate).toHaveLength(0);
  });

  it('scarta la voce di una sessione riaperta invece di spedirla a metà', async () => {
    db = nuovoDb();
    const sessione = await sessioneChiusa();
    // Voce rimasta da una versione precedente: la riapertura normalmente la toglie da sola.
    await riapriSessione(db, sessione.id);
    await db.codaUpload.add({
      tipo: 'sessione',
      riferimento: sessione.id,
      creataIl: '',
      tentativi: 0,
    });
    const { recupera, chiamate } = fetchFinto();
    expect(await svuotaCoda({ db, impostazioni: connessione, recupera })).toEqual({
      inviate: 0,
      rimaste: 0,
    });
    expect(chiamate).toHaveLength(0);
  });

  it('invia gli abbinamenti barcode in una sola chiamata leggendoli dallo store', async () => {
    db = nuovoDb();
    await db.prodotti.bulkPut([prodotto('A1', 'Scatola'), prodotto('B2', 'Nastro')]);
    await abbinaBarcode(db, '111', 'A1');
    await abbinaBarcode(db, '222', 'A1');
    // Riabbinato prima dell'invio: parte l'abbinamento più recente, una voce sola.
    await abbinaBarcode(db, '111', 'B2');
    // Voce di un barcode che nel frattempo è arrivato da Easyfatt: non si invia.
    await db.codaUpload.add({ tipo: 'barcode', riferimento: '333', creataIl: '', tentativi: 0 });
    await db.barcode.put({
      barcode: '333',
      codiceProdotto: 'A1',
      origine: 'easyfatt',
      aggiornatoIl: '2026-09-17T08:00:00.000Z',
    });
    const { recupera, chiamate } = fetchFinto(new Response(null, { status: 204 }));

    expect(await svuotaCoda({ db, impostazioni: connessione, recupera })).toEqual({
      inviate: 2,
      rimaste: 0,
    });
    expect(chiamate).toHaveLength(1);
    expect(chiamate[0]?.url).toBe('https://bridge.esempio.it/api/barcode');
    expect(JSON.parse(String(chiamate[0]?.init?.body))).toEqual([
      { barcode: '111', codiceProdotto: 'B2' },
      { barcode: '222', codiceProdotto: 'A1' },
    ]);
  });

  it('se il bridge è irraggiungibile per i barcode non prova nemmeno le sessioni', async () => {
    db = nuovoDb();
    await db.prodotti.put(prodotto('A1', 'Scatola'));
    await abbinaBarcode(db, '111', 'A1');
    await sessioneChiusa();
    const { recupera, chiamate } = fetchFinto(new TypeError('Failed to fetch'));
    const esito = await svuotaCoda({ db, impostazioni: connessione, recupera });
    expect(esito).toMatchObject({ inviate: 0, rimaste: 2 });
    expect(chiamate).toHaveLength(1);
  });
});

describe('servizio della coda', () => {
  it('chiusa offline, al ritorno della rete la sessione parte una volta sola', async () => {
    db = nuovoDb();
    await salvaImpostazioni(db, connessione);
    let online = false;
    const { recupera, chiamate } = fetchFinto(creata(), creata());
    const servizio = creaServizioCoda({ db, recupera, online: () => online });
    const finestra = new EventTarget();
    const smetti = avviaServizioCoda(servizio, finestra as unknown as Window);

    // Avvio offline: nessun tentativo, la coda resta.
    await servizio.invia();
    await sessioneChiusa();
    await servizio.invia();
    expect(chiamate).toHaveLength(0);
    expect(servizio.stato().ultimoEsito).toMatchObject({ rimaste: 1, errore: 'Sei offline.' });

    // Torna la rete: evento `online` e, insieme, l'utente preme "Invia ora".
    online = true;
    finestra.dispatchEvent(new Event('online'));
    const manuale = servizio.invia();
    finestra.dispatchEvent(new Event('online'));
    await manuale;
    await servizio.invia();

    expect(chiamate).toHaveLength(1);
    expect(await db.codaUpload.count()).toBe(0);
    expect(servizio.stato()).toEqual({ inCorso: false, ultimoEsito: { inviate: 0, rimaste: 0 } });

    smetti();
    await sessioneChiusa('Dopo');
    finestra.dispatchEvent(new Event('online'));
    expect(servizio.stato().inCorso).toBe(false);
    expect(chiamate).toHaveLength(1);
  });

  it('avvisa chi ascolta quando un giro inizia e finisce', async () => {
    db = nuovoDb();
    const servizio = creaServizioCoda({ db, online: () => false });
    const stati: boolean[] = [];
    const smetti = servizio.iscrivi(() => stati.push(servizio.stato().inCorso));
    await servizio.invia();
    smetti();
    expect(stati).toEqual([true, false]);
  });
});
