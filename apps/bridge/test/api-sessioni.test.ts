import { describe, expect, it } from 'vitest';
import { chiamaApi, chiamaApiConCorpo, creaTenant, sessioneDiProva } from './aiuti.js';

describe('POST /api/sessioni', () => {
  it('crea una sessione e la si ritrova nell elenco, nel dettaglio e nel file', async () => {
    const tenant = await creaTenant();
    const sessione = sessioneDiProva();

    const creazione = await chiamaApiConCorpo('POST', '/api/sessioni', tenant.token, sessione);
    expect(creazione.status).toBe(201);
    const corpoCreazione = (await creazione.json()) as { id: string; ricevutaIl: string };
    expect(corpoCreazione.id).toBe(sessione.id);
    expect(Number.isNaN(Date.parse(corpoCreazione.ricevutaIl))).toBe(false);

    const elenco = (await (await chiamaApi('/api/sessioni', tenant.token)).json()) as {
      id: string;
      conteggioRighe: number;
      sommaQuantita: number;
    }[];
    expect(elenco).toHaveLength(1);
    expect(elenco[0]).toMatchObject({ id: sessione.id, conteggioRighe: 2, sommaQuantita: 5 });

    const dettaglio = (await (
      await chiamaApi(`/api/sessioni/${sessione.id}`, tenant.token)
    ).json()) as { righe: { ordine: number; codiceProdotto: string }[] };
    expect(dettaglio.righe.map((r) => r.ordine)).toEqual([0, 1]);
    expect(dettaglio.righe.every((r) => r.codiceProdotto === 'ABC')).toBe(true);

    const file = await chiamaApi(`/api/sessioni/${sessione.id}/terminale.txt`, tenant.token);
    expect(file.status).toBe(200);
    expect(file.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(file.headers.get('content-disposition')).toMatch(
      /^attachment; filename="terminale-inventario-scaffale-a-\d{8}\.txt"$/,
    );
    const testo = await file.text();
    // Le due righe di ABC diventano una sola riga sommata: 2 + 3 = 5.
    expect(testo).toBe('ABC,5\r\n');

    const dopoExport = (await (
      await chiamaApi(`/api/sessioni/${sessione.id}`, tenant.token)
    ).json()) as { stato: string };
    expect(dopoExport.stato).toBe('esportata');
  });

  it('rifiuta una sessione con stato diverso da chiusa', async () => {
    const tenant = await creaTenant();
    const sessione = sessioneDiProva({ stato: 'aperta' });
    const risposta = await chiamaApiConCorpo('POST', '/api/sessioni', tenant.token, sessione);
    expect(risposta.status).toBe(400);
    expect((await risposta.json()) as { errore: string }).toMatchObject({
      errore: expect.stringContaining('chiusa'),
    });
  });

  it('rifiuta una sessione senza righe', async () => {
    const tenant = await creaTenant();
    const sessione = sessioneDiProva({ righe: [] });
    const risposta = await chiamaApiConCorpo('POST', '/api/sessioni', tenant.token, sessione);
    expect(risposta.status).toBe(400);
    expect((await risposta.json()) as { errore: string }).toMatchObject({
      errore: expect.stringContaining('righe'),
    });
  });

  it('rifiuta un corpo che non rispetta lo schema', async () => {
    const tenant = await creaTenant();
    const risposta = await chiamaApiConCorpo('POST', '/api/sessioni', tenant.token, {
      tipo: 'inventario',
    });
    expect(risposta.status).toBe(400);
  });

  it('un secondo invio con lo stesso id sostituisce righe e campi, mantiene ricevutaIl', async () => {
    const tenant = await creaTenant();
    const prima = sessioneDiProva();
    const primaRisposta = await chiamaApiConCorpo('POST', '/api/sessioni', tenant.token, prima);
    const { ricevutaIl: primaRicevutaIl } = (await primaRisposta.json()) as {
      ricevutaIl: string;
    };

    const seconda = sessioneDiProva({
      nome: 'Scaffale A bis',
      righe: [
        {
          id: 'riga-3',
          sessioneId: prima.id,
          codiceProdotto: 'XYZ',
          quantita: 7,
          lettaIl: '2026-02-01T09:05:00.000Z',
          ordine: 0,
        },
      ],
    });
    const secondaRisposta = await chiamaApiConCorpo('POST', '/api/sessioni', tenant.token, seconda);
    expect(secondaRisposta.status).toBe(201);
    const { ricevutaIl: secondaRicevutaIl } = (await secondaRisposta.json()) as {
      ricevutaIl: string;
    };
    expect(secondaRicevutaIl).toBe(primaRicevutaIl);

    const dettaglio = (await (
      await chiamaApi(`/api/sessioni/${prima.id}`, tenant.token)
    ).json()) as { nome: string; righe: unknown[] };
    expect(dettaglio.nome).toBe('Scaffale A bis');
    expect(dettaglio.righe).toHaveLength(1);
  });

  it('un nuovo invio dopo l export riporta lo stato a chiusa e ripulisce esportataIl', async () => {
    const tenant = await creaTenant();
    const sessione = sessioneDiProva();
    await chiamaApiConCorpo('POST', '/api/sessioni', tenant.token, sessione);
    await chiamaApi(`/api/sessioni/${sessione.id}/terminale.txt`, tenant.token);

    const espostata = (await (
      await chiamaApi(`/api/sessioni/${sessione.id}`, tenant.token)
    ).json()) as { stato: string };
    expect(espostata.stato).toBe('esportata');

    await chiamaApiConCorpo('POST', '/api/sessioni', tenant.token, sessione);
    const dopo = (await (await chiamaApi(`/api/sessioni/${sessione.id}`, tenant.token)).json()) as {
      stato: string;
      esportataIl?: string;
    };
    expect(dopo.stato).toBe('chiusa');
    expect(dopo.esportataIl).toBeUndefined();
  });
});

describe('GET /api/sessioni/:id/terminale.txt', () => {
  it('con soloAnteprima=1 non cambia lo stato', async () => {
    const tenant = await creaTenant();
    const sessione = sessioneDiProva();
    await chiamaApiConCorpo('POST', '/api/sessioni', tenant.token, sessione);

    const anteprima = await chiamaApi(
      `/api/sessioni/${sessione.id}/terminale.txt?soloAnteprima=1`,
      tenant.token,
    );
    expect(anteprima.status).toBe(200);

    const dopo = (await (await chiamaApi(`/api/sessioni/${sessione.id}`, tenant.token)).json()) as {
      stato: string;
    };
    expect(dopo.stato).toBe('chiusa');
  });

  it('risponde 404 per una sessione inesistente', async () => {
    const tenant = await creaTenant();
    const risposta = await chiamaApi('/api/sessioni/non-esiste/terminale.txt', tenant.token);
    expect(risposta.status).toBe(404);
  });
});

describe('PATCH /api/sessioni/:id', () => {
  it('segue le transizioni chiusa -> esportata -> importata', async () => {
    const tenant = await creaTenant();
    const sessione = sessioneDiProva();
    await chiamaApiConCorpo('POST', '/api/sessioni', tenant.token, sessione);

    const versoEsportata = await chiamaApiConCorpo(
      'PATCH',
      `/api/sessioni/${sessione.id}`,
      tenant.token,
      { stato: 'esportata' },
    );
    expect(versoEsportata.status).toBe(200);
    const corpoEsportata = (await versoEsportata.json()) as {
      stato: string;
      esportataIl?: string;
    };
    expect(corpoEsportata.stato).toBe('esportata');
    expect(corpoEsportata.esportataIl).not.toBeUndefined();

    const versoImportata = await chiamaApiConCorpo(
      'PATCH',
      `/api/sessioni/${sessione.id}`,
      tenant.token,
      { stato: 'importata' },
    );
    expect(versoImportata.status).toBe(200);
    const corpoImportata = (await versoImportata.json()) as {
      stato: string;
      importataIl?: string;
    };
    expect(corpoImportata.stato).toBe('importata');
    expect(corpoImportata.importataIl).not.toBeUndefined();
  });

  it('rifiuta una transizione non ammessa con 409', async () => {
    const tenant = await creaTenant();
    const sessione = sessioneDiProva();
    await chiamaApiConCorpo('POST', '/api/sessioni', tenant.token, sessione);

    const risposta = await chiamaApiConCorpo(
      'PATCH',
      `/api/sessioni/${sessione.id}`,
      tenant.token,
      { stato: 'importata' },
    );
    expect(risposta.status).toBe(409);
  });

  it('rifiuta uno stato non gestito dal bridge con 409', async () => {
    const tenant = await creaTenant();
    const sessione = sessioneDiProva();
    await chiamaApiConCorpo('POST', '/api/sessioni', tenant.token, sessione);

    const risposta = await chiamaApiConCorpo(
      'PATCH',
      `/api/sessioni/${sessione.id}`,
      tenant.token,
      { stato: 'aperta' },
    );
    expect(risposta.status).toBe(409);
  });

  it('risponde 404 per una sessione inesistente', async () => {
    const tenant = await creaTenant();
    const risposta = await chiamaApiConCorpo('PATCH', '/api/sessioni/non-esiste', tenant.token, {
      stato: 'esportata',
    });
    expect(risposta.status).toBe(404);
  });
});

describe('isolamento fra tenant', () => {
  it('non mostra le sessioni di un altro tenant', async () => {
    const primo = await creaTenant(1);
    const secondo = await creaTenant(2);
    const sessione = sessioneDiProva();
    await chiamaApiConCorpo('POST', '/api/sessioni', primo.token, sessione);

    const elencoSecondo = (await (
      await chiamaApi('/api/sessioni', secondo.token)
    ).json()) as unknown[];
    expect(elencoSecondo).toEqual([]);

    const dettaglioSecondo = await chiamaApi(`/api/sessioni/${sessione.id}`, secondo.token);
    expect(dettaglioSecondo.status).toBe(404);
  });
});

describe('autenticazione', () => {
  it('rifiuta ogni rotta delle sessioni senza token', async () => {
    const tenant = await creaTenant();
    const sessione = sessioneDiProva();
    await chiamaApiConCorpo('POST', '/api/sessioni', tenant.token, sessione);

    expect((await chiamaApiConCorpo('POST', '/api/sessioni', null, sessione)).status).toBe(401);
    expect((await chiamaApi('/api/sessioni', null)).status).toBe(401);
    expect((await chiamaApi(`/api/sessioni/${sessione.id}`, null)).status).toBe(401);
    expect((await chiamaApi(`/api/sessioni/${sessione.id}/terminale.txt`, null)).status).toBe(401);
    expect(
      (
        await chiamaApiConCorpo('PATCH', `/api/sessioni/${sessione.id}`, null, {
          stato: 'esportata',
        })
      ).status,
    ).toBe(401);
  });
});
