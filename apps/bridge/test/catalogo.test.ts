import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import catalogoFullV2 from '../../../packages/easyfatt/test/fixture/catalogo-full-v2.xml?raw';
import catalogoFullV3 from '../../../packages/easyfatt/test/fixture/catalogo-full-v3-varianti.xml?raw';
import catalogoIncremental from '../../../packages/easyfatt/test/fixture/catalogo-incremental.xml?raw';
import catalogoMalformato from '../../../packages/easyfatt/test/fixture/catalogo-malformato.xml?raw';
import { basic, chiama, creaTenant, inviaCatalogo } from './aiuti.js';
import type { TenantDiProva } from './aiuti.js';

/** Legge una riga della tabella prodotto. */
async function prodotto(tenant: TenantDiProva, codice: string) {
  return env.DB.prepare('SELECT * FROM prodotto WHERE tenant_id = ?1 AND codice = ?2')
    .bind(tenant.id, codice)
    .first<Record<string, unknown>>();
}

/** Legge una riga della tabella barcode. */
async function barcode(tenant: TenantDiProva, valore: string) {
  return env.DB.prepare('SELECT * FROM barcode WHERE tenant_id = ?1 AND barcode = ?2')
    .bind(tenant.id, valore)
    .first<Record<string, unknown>>();
}

/** Legge la data dell'ultimo catalogo ricevuto dal tenant. */
async function ultimoCatalogo(tenant: TenantDiProva): Promise<string | null> {
  const riga = await env.DB.prepare('SELECT ultimo_catalogo_il FROM tenant WHERE id = ?1')
    .bind(tenant.id)
    .first<{ ultimo_catalogo_il: string | null }>();
  return riga?.ultimo_catalogo_il ?? null;
}

describe('POST /easyfatt/catalogo', () => {
  it('salva un catalogo full e risponde esattamente OK', async () => {
    const tenant = await creaTenant();
    const risposta = await inviaCatalogo(tenant, catalogoFullV2);

    expect(risposta.status).toBe(200);
    expect(await risposta.text()).toBe('OK');
    expect(risposta.headers.get('content-type')).toBe('text/plain; charset=utf-8');

    const bancale = await prodotto(tenant, '+banp_1200800p');
    expect(bancale).toMatchObject({
      descrizione: 'Bancale in plastica 1200x800',
      categoria: 'Bancali',
      um: 'pz',
      iva_perc: 22,
      gestione_magazzino: 1,
      ubicazione: 'A-03',
      giacenza: 17,
      fornitore: 'Fornitore Srl',
      eliminato_il: null,
    });
    expect(JSON.parse(String(bancale?.['prezzi_netti']))).toEqual([
      30.33,
      28.5,
      null,
      null,
      null,
      null,
      null,
      null,
      25,
    ]);

    // ManageWarehouse false diventa 0; se il tag manca resta il valore di ripiego 1.
    expect(await prodotto(tenant, 'FILM500')).toMatchObject({ gestione_magazzino: 0 });
    expect(await prodotto(tenant, 'SCAT-30')).toMatchObject({
      gestione_magazzino: 1,
      descrizione: '',
      categoria: null,
      scorta_minima: null,
    });

    expect(await barcode(tenant, '8001234567890')).toMatchObject({
      codice_prodotto: '+banp_1200800p',
      origine: 'easyfatt',
      quantita_confezione: null,
    });
    expect(await barcode(tenant, 'XY981')).toMatchObject({ quantita_confezione: 12 });

    expect(await ultimoCatalogo(tenant)).not.toBeNull();
  });

  it('salva i barcode delle varianti del protocollo 3 sul prodotto padre', async () => {
    const tenant = await creaTenant();
    expect((await inviaCatalogo(tenant, catalogoFullV3)).status).toBe(200);

    expect(await barcode(tenant, '0042/M/Blu')).toMatchObject({ codice_prodotto: 'MAGL-0042' });
    expect(await barcode(tenant, '0042/L/Rosso')).toMatchObject({ codice_prodotto: 'MAGL-0042' });
    expect(await prodotto(tenant, 'SENZA-BARCODE')).not.toBeNull();
  });

  it('con un secondo full marca come eliminato ciò che non arriva più', async () => {
    const tenant = await creaTenant();
    expect((await inviaCatalogo(tenant, catalogoFullV2)).status).toBe(200);
    const primoInvio = await ultimoCatalogo(tenant);

    expect((await inviaCatalogo(tenant, catalogoFullV3)).status).toBe(200);
    const secondoInvio = await ultimoCatalogo(tenant);
    expect(secondoInvio).not.toBe(primoInvio);

    // I prodotti del primo catalogo sono tombstone, quelli del secondo sono vivi.
    expect(await prodotto(tenant, 'FILM500')).toMatchObject({ eliminato_il: secondoInvio });
    expect(await prodotto(tenant, 'MAGL-0042')).toMatchObject({ eliminato_il: null });
    expect(await barcode(tenant, '8001234567890')).toMatchObject({ eliminato_il: secondoInvio });
    expect(await barcode(tenant, '0042')).toMatchObject({ eliminato_il: null });
  });

  it('un prodotto eliminato e poi reinviato torna vivo', async () => {
    const tenant = await creaTenant();
    await inviaCatalogo(tenant, catalogoFullV2);
    await inviaCatalogo(tenant, catalogoFullV3);
    expect(await prodotto(tenant, 'FILM500')).toMatchObject({ eliminato_il: expect.any(String) });

    await inviaCatalogo(tenant, catalogoFullV2);
    expect(await prodotto(tenant, 'FILM500')).toMatchObject({ eliminato_il: null });
    expect(await barcode(tenant, '8009876543210')).toMatchObject({ eliminato_il: null });
  });

  it('in incremental aggiorna gli Updated ed elimina solo i Deleted', async () => {
    const tenant = await creaTenant();
    await inviaCatalogo(tenant, catalogoFullV2);

    expect((await inviaCatalogo(tenant, catalogoIncremental)).status).toBe(200);

    expect(await prodotto(tenant, 'FILM500')).toMatchObject({
      descrizione: 'Film estensibile 500 mm trasparente rinforzato',
      giacenza: 120.5,
      ordinato: 50,
      eliminato_il: null,
    });
    expect(await prodotto(tenant, 'SCAT-30')).toMatchObject({ eliminato_il: expect.any(String) });
    expect(await prodotto(tenant, '+banp_1200800p')).toMatchObject({
      eliminato_il: expect.any(String),
    });
    // I barcode del prodotto eliminato seguono il prodotto.
    expect(await barcode(tenant, '8001234567890')).toMatchObject({
      eliminato_il: expect.any(String),
    });
  });

  it('non tocca i barcode di origine app, ma li passa a easyfatt se Easyfatt li invia', async () => {
    const tenant = await creaTenant();
    await env.DB.prepare(
      `INSERT INTO barcode (tenant_id, barcode, codice_prodotto, origine, aggiornato_il)
       VALUES (?1, 'MIO-BARCODE', 'FILM500', 'app', '2026-01-01T00:00:00.000Z'),
              (?1, '8001234567890', 'FILM500', 'app', '2026-01-01T00:00:00.000Z')`,
    )
      .bind(tenant.id)
      .run();

    await inviaCatalogo(tenant, catalogoFullV2);

    // Non presente nel catalogo: resta com'era, senza tombstone.
    expect(await barcode(tenant, 'MIO-BARCODE')).toMatchObject({
      origine: 'app',
      eliminato_il: null,
      aggiornato_il: '2026-01-01T00:00:00.000Z',
    });
    // Inviato da Easyfatt: passa a origine easyfatt e al prodotto indicato dal catalogo.
    expect(await barcode(tenant, '8001234567890')).toMatchObject({
      origine: 'easyfatt',
      codice_prodotto: '+banp_1200800p',
      eliminato_il: null,
    });
  });

  it('rifiuta un catalogo malformato con una frase leggibile e non tocca i dati', async () => {
    const tenant = await creaTenant();
    await inviaCatalogo(tenant, catalogoFullV2);
    const primoInvio = await ultimoCatalogo(tenant);

    const risposta = await inviaCatalogo(tenant, catalogoMalformato);
    expect(risposta.status).toBe(400);
    const corpo = await risposta.text();
    expect(corpo).toMatch(/XML non valido/);
    expect(corpo).not.toMatch(/\bat \w+.*:\d+/);
    expect(risposta.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(await ultimoCatalogo(tenant)).toBe(primoInvio);
  });

  it('rifiuta un XML che non è un catalogo Easyfatt', async () => {
    const tenant = await creaTenant();
    const risposta = await inviaCatalogo(tenant, '<?xml version="1.0"?><Altro/>');
    expect(risposta.status).toBe(400);
    expect(await risposta.text()).toMatch(/EasyfattProducts/);
  });

  it('rifiuta un catalogo senza attributo Mode', async () => {
    const tenant = await creaTenant();
    const risposta = await inviaCatalogo(
      tenant,
      '<?xml version="1.0"?><EasyfattProducts AppVersion="2"><Products/></EasyfattProducts>',
    );
    expect(risposta.status).toBe(400);
    expect(await risposta.text()).toMatch(/Mode/);
  });

  it('rifiuta un corpo multipart senza il campo file', async () => {
    const tenant = await creaTenant();
    const modulo = new FormData();
    modulo.append('altro', 'niente');
    const risposta = await chiama(
      new Request('http://localhost/easyfatt/catalogo', {
        method: 'POST',
        body: modulo,
        headers: { authorization: basic(tenant.utente, tenant.password) },
      }),
    );
    expect(risposta.status).toBe(400);
    expect(await risposta.text()).toMatch(/Campo «file» mancante/);
    expect(await ultimoCatalogo(tenant)).toBeNull();
  });

  it('rifiuta un corpo che non è multipart', async () => {
    const tenant = await creaTenant();
    const risposta = await chiama(
      new Request('http://localhost/easyfatt/catalogo', {
        method: 'POST',
        body: 'testo semplice',
        headers: {
          authorization: basic(tenant.utente, tenant.password),
          'content-type': 'text/plain',
        },
      }),
    );
    expect(risposta.status).toBe(400);
    expect(await risposta.text()).toMatch(/multipart\/form-data/);
  });

  it('accetta il campo file inviato come testo invece che come allegato', async () => {
    const tenant = await creaTenant();
    const modulo = new FormData();
    modulo.append('file', catalogoFullV3);
    const risposta = await chiama(
      new Request('http://localhost/easyfatt/catalogo', {
        method: 'POST',
        body: modulo,
        headers: { authorization: basic(tenant.utente, tenant.password) },
      }),
    );
    expect(risposta.status).toBe(200);
    expect(await risposta.text()).toBe('OK');
  });

  it('non mescola i cataloghi di due tenant diversi', async () => {
    const primo = await creaTenant(1);
    const secondo = await creaTenant(2);
    await inviaCatalogo(primo, catalogoFullV2);
    await inviaCatalogo(secondo, catalogoFullV3);

    expect(await prodotto(primo, 'MAGL-0042')).toBeNull();
    expect(await prodotto(secondo, 'FILM500')).toBeNull();
    expect(await prodotto(secondo, 'MAGL-0042')).not.toBeNull();
  });

  it("richiede l'autenticazione", async () => {
    const tenant = await creaTenant();
    const risposta = await inviaCatalogo(tenant, catalogoFullV2, {
      authorization: basic(tenant.utente, 'sbagliata'),
    });
    expect(risposta.status).toBe(401);
  });
});

describe('GET /easyfatt/documenti', () => {
  it('risponde un EasyfattDocuments vuoto in XML', async () => {
    const tenant = await creaTenant();
    const risposta = await chiama(
      new Request('http://localhost/easyfatt/documenti', {
        headers: { authorization: basic(tenant.utente, tenant.password) },
      }),
    );
    expect(risposta.status).toBe(200);
    expect(risposta.headers.get('content-type')).toBe('application/xml; charset=utf-8');
    const corpo = await risposta.text();
    expect(corpo).toMatch(/<EasyfattDocuments/);
    expect(corpo).not.toMatch(/<Document>/);
  });
});

describe('salvataggio a blocchi', () => {
  /** Catalogo full con il numero di prodotti richiesto, per superare la soglia di un blocco. */
  function catalogoGrande(quantita: number): string {
    const righe = Array.from(
      { length: quantita },
      (_, indice) =>
        `<Product><Code>P${indice}</Code><Description>Prodotto ${indice}</Description>` +
        `<Barcode>80000000${String(indice).padStart(5, '0')}</Barcode></Product>`,
    ).join('');
    return `<?xml version="1.0" encoding="UTF-8"?><EasyfattProducts AppVersion="2" Mode="full"><Products>${righe}</Products></EasyfattProducts>`;
  }

  it('salva un catalogo che occupa più blocchi di statement', async () => {
    const tenant = await creaTenant();
    const risposta = await inviaCatalogo(tenant, catalogoGrande(120));
    expect(risposta.status).toBe(200);
    expect(await risposta.text()).toBe('OK');

    const conteggio = await env.DB.prepare(
      'SELECT COUNT(*) AS totale FROM prodotto WHERE tenant_id = ?1 AND eliminato_il IS NULL',
    )
      .bind(tenant.id)
      .first<{ totale: number }>();
    expect(conteggio?.totale).toBe(120);
    expect(await barcode(tenant, '8000000000119')).toMatchObject({ codice_prodotto: 'P119' });
  });

  it('se il salvataggio fallisce non scrive nulla e lascia invariato ultimo_catalogo_il', async () => {
    const tenant = await creaTenant();
    await inviaCatalogo(tenant, catalogoFullV3);
    const primoInvio = await ultimoCatalogo(tenant);

    // Si nasconde la tabella per far fallire il primo blocco di statement.
    await env.DB.prepare('ALTER TABLE prodotto RENAME TO prodotto_nascosto').run();
    let risposta: Response;
    try {
      risposta = await inviaCatalogo(tenant, catalogoFullV2);
    } finally {
      await env.DB.prepare('ALTER TABLE prodotto_nascosto RENAME TO prodotto').run();
    }

    expect(risposta.status).toBe(400);
    const corpo = await risposta.text();
    expect(corpo).toMatch(/il catalogo precedente non è stato modificato/i);
    expect(corpo).not.toMatch(/prodotto_nascosto|SQLITE|D1_ERROR/);
    expect(await ultimoCatalogo(tenant)).toBe(primoInvio);
    expect(await prodotto(tenant, '+banp_1200800p')).toBeNull();
    expect(await barcode(tenant, '8001234567890')).toBeNull();
  });
});
