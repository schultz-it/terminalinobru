import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import {
  basic,
  chiama,
  chiamaApi,
  chiamaApiConCorpo,
  creaTenant,
  sessioneDdtDiProva,
} from './aiuti.js';
import type { TenantDiProva } from './aiuti.js';

/** Chiama `GET /easyfatt/documenti` come farebbe Easyfatt, con Basic auth. */
async function documenti(tenant: TenantDiProva, query = ''): Promise<Response> {
  return chiama(
    new Request(`http://localhost/easyfatt/documenti${query}`, {
      headers: { authorization: basic(tenant.utente, tenant.password) },
    }),
  );
}

/** Stato di una sessione, dal dettaglio `/api/sessioni/:id`. */
async function statoSessione(tenant: TenantDiProva, id: string): Promise<string> {
  const corpo = (await (await chiamaApi(`/api/sessioni/${id}`, tenant.token)).json()) as {
    stato: string;
  };
  return corpo.stato;
}

describe('GET /easyfatt/documenti (v2)', () => {
  it(
    'criteri di accettazione T13: due ddt numerati 1 e 2, segnati esportata; poi con ' +
      'firstnum oltre restituisce vuoto e li segna importata',
    async () => {
      const tenant = await creaTenant();
      await chiamaApiConCorpo(
        'POST',
        '/api/sessioni',
        tenant.token,
        sessioneDdtDiProva({ id: 'ddt-1' }),
      );
      await chiamaApiConCorpo(
        'POST',
        '/api/sessioni',
        tenant.token,
        sessioneDdtDiProva({ id: 'ddt-2', nome: 'Ordine 2' }),
      );

      const prima = await documenti(tenant, '?appver=2');
      expect(prima.status).toBe(200);
      expect(prima.headers.get('content-type')).toBe('application/xml; charset=utf-8');
      const corpoPrima = await prima.text();
      expect((corpoPrima.match(/<Document>/g) ?? []).length).toBe(2);
      expect(corpoPrima).toMatch(/<Number>1<\/Number>/);
      expect(corpoPrima).toMatch(/<Number>2<\/Number>/);

      expect(await statoSessione(tenant, 'ddt-1')).toBe('esportata');
      expect(await statoSessione(tenant, 'ddt-2')).toBe('esportata');

      const seconda = await documenti(tenant, '?firstnum=3');
      expect(seconda.status).toBe(200);
      const corpoSeconda = await seconda.text();
      expect(corpoSeconda).not.toMatch(/<Document>/);

      expect(await statoSessione(tenant, 'ddt-1')).toBe('importata');
      expect(await statoSessione(tenant, 'ddt-2')).toBe('importata');
    },
  );

  it('risponde un EasyfattDocuments vuoto senza sessioni ddt', async () => {
    const tenant = await creaTenant();
    const risposta = await documenti(tenant);
    expect(risposta.status).toBe(200);
    const corpo = await risposta.text();
    expect(corpo).toMatch(/<EasyfattDocuments/);
    expect(corpo).not.toMatch(/<Document>/);
  });

  it('il cliente e le righe aggregate finiscono nel Document, con la descrizione dal catalogo', async () => {
    const tenant = await creaTenant();
    await env.DB.prepare(
      `INSERT INTO prodotto (tenant_id, codice, descrizione, prezzi_netti, prezzi_lordi, aggiornato_il)
       VALUES (?1, 'ABC', 'Scatola di cartone', '[]', '[]', '2026-01-01T00:00:00.000Z')`,
    )
      .bind(tenant.id)
      .run();
    await chiamaApiConCorpo(
      'POST',
      '/api/sessioni',
      tenant.token,
      sessioneDdtDiProva({
        righe: [
          {
            id: 'r1',
            sessioneId: 'sessione-ddt-1',
            codiceProdotto: 'ABC',
            quantita: 2,
            lettaIl: '2026-02-01T09:01:00.000Z',
            ordine: 0,
          },
          {
            id: 'r2',
            sessioneId: 'sessione-ddt-1',
            codiceProdotto: 'ABC',
            quantita: 3,
            lettaIl: '2026-02-01T09:02:00.000Z',
            ordine: 1,
          },
        ],
      }),
    );

    const corpo = await (await documenti(tenant)).text();
    expect(corpo).toMatch(/<CustomerName>Ceramiche Italiane<\/CustomerName>/);
    expect(corpo).toMatch(/<CustomerVatCode>03322350178<\/CustomerVatCode>/);
    expect(corpo).toMatch(/<Code>ABC<\/Code>/);
    expect(corpo).toMatch(/<Description>Scatola di cartone<\/Description>/);
    // Le due righe di ABC diventano una sola riga sommata: 2 + 3 = 5.
    expect(corpo).toMatch(/<Qty>5<\/Qty>/);
  });

  it('filtra su firstnum/lastnum senza toccare le sessioni fuori intervallo', async () => {
    const tenant = await creaTenant();
    await chiamaApiConCorpo(
      'POST',
      '/api/sessioni',
      tenant.token,
      sessioneDdtDiProva({ id: 'ddt-1' }),
    );
    await chiamaApiConCorpo(
      'POST',
      '/api/sessioni',
      tenant.token,
      sessioneDdtDiProva({ id: 'ddt-2' }),
    );
    await chiamaApiConCorpo(
      'POST',
      '/api/sessioni',
      tenant.token,
      sessioneDdtDiProva({ id: 'ddt-3' }),
    );

    const risposta = await documenti(tenant, '?firstnum=2&lastnum=2');
    const corpo = await risposta.text();
    expect((corpo.match(/<Document>/g) ?? []).length).toBe(1);
    expect(corpo).toMatch(/<Number>2<\/Number>/);

    expect(await statoSessione(tenant, 'ddt-1')).toBe('chiusa');
    expect(await statoSessione(tenant, 'ddt-2')).toBe('esportata');
    expect(await statoSessione(tenant, 'ddt-3')).toBe('chiusa');
  });

  it('filtra su firstdate/lastdate leggendo la data di chiusura nel fuso Europe/Rome', async () => {
    const tenant = await creaTenant();
    await chiamaApiConCorpo(
      'POST',
      '/api/sessioni',
      tenant.token,
      sessioneDdtDiProva({ id: 'ddt-gennaio', chiusaIl: '2026-01-15T10:00:00.000Z' }),
    );
    await chiamaApiConCorpo(
      'POST',
      '/api/sessioni',
      tenant.token,
      sessioneDdtDiProva({ id: 'ddt-febbraio', chiusaIl: '2026-02-15T10:00:00.000Z' }),
    );

    const risposta = await documenti(tenant, '?firstdate=2026-02-01&lastdate=2026-02-28');
    const corpo = await risposta.text();
    expect((corpo.match(/<Document>/g) ?? []).length).toBe(1);
    expect(corpo).toMatch(/<Date>2026-02-15<\/Date>/);

    expect(await statoSessione(tenant, 'ddt-gennaio')).toBe('chiusa');
    expect(await statoSessione(tenant, 'ddt-febbraio')).toBe('esportata');
  });

  it('esclude una sessione ddt senza cliente invece di rompere la risposta', async () => {
    const tenant = await creaTenant();
    await env.DB.prepare(
      `INSERT INTO sessione (
         id, tenant_id, tipo, nome, stato, modalita, creata_il, chiusa_il, ricevuta_il, numero_documento
       ) VALUES (
         'legacy-1', ?1, 'ddt', 'Vecchio DDT', 'chiusa', 'chiedi_quantita',
         '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 1
       )`,
    )
      .bind(tenant.id)
      .run();

    const risposta = await documenti(tenant);
    expect(risposta.status).toBe(200);
    const corpo = await risposta.text();
    expect(corpo).not.toMatch(/<Document>/);
    expect(await statoSessione(tenant, 'legacy-1')).toBe('chiusa');
  });

  it('rifiuta un parametro malformato in testo puro, mai JSON', async () => {
    const tenant = await creaTenant();
    const risposta = await documenti(tenant, '?firstnum=abc');
    expect(risposta.status).toBe(400);
    expect(risposta.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(await risposta.text()).not.toMatch(/^[{[]/);
  });

  it('non mescola le sessioni di due tenant diversi', async () => {
    const primo = await creaTenant(1);
    const secondo = await creaTenant(2);
    await chiamaApiConCorpo('POST', '/api/sessioni', primo.token, sessioneDdtDiProva());

    const risposta = await documenti(secondo);
    const corpo = await risposta.text();
    expect(corpo).not.toMatch(/<Document>/);
  });

  it("richiede l'autenticazione", async () => {
    const risposta = await chiama(new Request('http://localhost/easyfatt/documenti'));
    expect(risposta.status).toBe(401);
  });
});

describe('GET /easyfatt/documenti con molti codici e molte sessioni', () => {
  it('supera il limite di 100 parametri per query di D1 spezzando le query a blocchi', async () => {
    const tenant = await creaTenant();
    // 250 codici distinti in una sessione: la ricerca delle descrizioni deve andare a blocchi.
    const codici = Array.from({ length: 250 }, (_, i) => `P${String(i).padStart(3, '0')}`);
    for (let inizio = 0; inizio < codici.length; inizio += 50) {
      await env.DB.batch(
        codici.slice(inizio, inizio + 50).map((codice) =>
          env.DB.prepare(
            `INSERT INTO prodotto (tenant_id, codice, descrizione, prezzi_netti, prezzi_lordi, aggiornato_il)
             VALUES (?1, ?2, ?3, '[]', '[]', '2026-01-01T00:00:00.000Z')`,
          ).bind(tenant.id, codice, `Descrizione ${codice}`),
        ),
      );
    }
    await chiamaApiConCorpo(
      'POST',
      '/api/sessioni',
      tenant.token,
      sessioneDdtDiProva({
        id: 'ddt-grande',
        righe: codici.map((codice, i) => ({
          id: `r-${codice}`,
          sessioneId: 'ddt-grande',
          codiceProdotto: codice,
          quantita: 1,
          lettaIl: '2026-02-01T09:01:00.000Z',
          ordine: i,
        })),
      }),
    );
    // Altre 120 sessioni ddt: la lettura delle righe deve andare a blocchi.
    for (let i = 0; i < 120; i += 1) {
      await chiamaApiConCorpo(
        'POST',
        '/api/sessioni',
        tenant.token,
        sessioneDdtDiProva({ id: `ddt-${i}` }),
      );
    }

    const risposta = await documenti(tenant);
    expect(risposta.status).toBe(200);
    const corpo = await risposta.text();
    expect((corpo.match(/<Document>/g) ?? []).length).toBe(121);
    expect((corpo.match(/<Description>Descrizione P\d{3}<\/Description>/g) ?? []).length).toBe(250);
    expect(corpo).toMatch(/<Description>Descrizione P249<\/Description>/);
  }, 60_000);
});
