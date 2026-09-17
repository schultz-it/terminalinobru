import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { chiamaApi, chiamaApiConCorpo, creaTenant } from './aiuti.js';

describe('POST /api/barcode', () => {
  it('crea abbinamenti con origine app e risponde 204', async () => {
    const tenant = await creaTenant();
    const risposta = await chiamaApiConCorpo('POST', '/api/barcode', tenant.token, [
      { barcode: '111', codiceProdotto: 'ABC' },
      { barcode: '222', codiceProdotto: 'XYZ' },
    ]);
    expect(risposta.status).toBe(204);

    const csv = await (await chiamaApi('/api/barcode/nuovi.csv', tenant.token)).text();
    expect(csv).toBe('codice;barcode\r\nABC;111\r\nXYZ;222\r\n');
  });

  it('non sovrascrive un barcode già di origine easyfatt', async () => {
    const tenant = await creaTenant();
    await env.DB.prepare(
      `INSERT INTO barcode (tenant_id, barcode, codice_prodotto, origine, aggiornato_il)
       VALUES (?1, '333', 'GIA-EASYFATT', 'easyfatt', '2026-01-01T00:00:00.000Z')`,
    )
      .bind(tenant.id)
      .run();

    const risposta = await chiamaApiConCorpo('POST', '/api/barcode', tenant.token, [
      { barcode: '333', codiceProdotto: 'ALTRO' },
    ]);
    expect(risposta.status).toBe(204);

    const riga = await env.DB.prepare(
      'SELECT codice_prodotto, origine FROM barcode WHERE tenant_id = ?1 AND barcode = ?2',
    )
      .bind(tenant.id, '333')
      .first<{ codice_prodotto: string; origine: string }>();
    expect(riga).toEqual({ codice_prodotto: 'GIA-EASYFATT', origine: 'easyfatt' });

    const csv = await (await chiamaApi('/api/barcode/nuovi.csv', tenant.token)).text();
    expect(csv).toBe('codice;barcode\r\n');
  });

  it('un secondo invio dello stesso barcode app aggiorna il codice prodotto', async () => {
    const tenant = await creaTenant();
    await chiamaApiConCorpo('POST', '/api/barcode', tenant.token, [
      { barcode: '444', codiceProdotto: 'PRIMO' },
    ]);
    await chiamaApiConCorpo('POST', '/api/barcode', tenant.token, [
      { barcode: '444', codiceProdotto: 'SECONDO' },
    ]);

    const csv = await (await chiamaApi('/api/barcode/nuovi.csv', tenant.token)).text();
    expect(csv).toBe('codice;barcode\r\nSECONDO;444\r\n');
  });

  it('rifiuta un corpo che non è un array di abbinamenti', async () => {
    const tenant = await creaTenant();
    const risposta = await chiamaApiConCorpo('POST', '/api/barcode', tenant.token, {
      barcode: '111',
      codiceProdotto: 'ABC',
    });
    expect(risposta.status).toBe(400);
  });
});

describe('GET /api/barcode/nuovi.csv', () => {
  it('risponde con intestazione anche senza abbinamenti', async () => {
    const tenant = await creaTenant();
    const risposta = await chiamaApi('/api/barcode/nuovi.csv', tenant.token);
    expect(risposta.status).toBe(200);
    expect(risposta.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(await risposta.text()).toBe('codice;barcode\r\n');
  });

  it('non mostra gli abbinamenti di un altro tenant', async () => {
    const primo = await creaTenant(1);
    const secondo = await creaTenant(2);
    await chiamaApiConCorpo('POST', '/api/barcode', primo.token, [
      { barcode: '555', codiceProdotto: 'SOLO-PRIMO' },
    ]);

    const csv = await (await chiamaApi('/api/barcode/nuovi.csv', secondo.token)).text();
    expect(csv).toBe('codice;barcode\r\n');
  });
});

describe('autenticazione', () => {
  it('rifiuta le rotte barcode senza token', async () => {
    expect((await chiamaApiConCorpo('POST', '/api/barcode', null, [])).status).toBe(401);
    expect((await chiamaApi('/api/barcode/nuovi.csv', null)).status).toBe(401);
  });
});
