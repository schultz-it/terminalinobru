import { describe, expect, it } from 'vitest';
import {
  chiamaApi,
  chiamaApiConCorpo,
  chiamaApiMetodo,
  clienteDocumentoDiProva,
  creaTenant,
  sessioneDdtDiProva,
  sessioneDiProva,
} from './aiuti.js';

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

  it('riporta a chiusa una sessione esportata e permette di rifare l export', async () => {
    const tenant = await creaTenant();
    const sessione = sessioneDiProva();
    await chiamaApiConCorpo('POST', '/api/sessioni', tenant.token, sessione);
    await chiamaApi(`/api/sessioni/${sessione.id}/terminale.txt`, tenant.token);

    const risposta = await chiamaApiConCorpo(
      'PATCH',
      `/api/sessioni/${sessione.id}`,
      tenant.token,
      { stato: 'chiusa' },
    );
    expect(risposta.status).toBe(200);
    const corpo = (await risposta.json()) as { stato: string; esportataIl?: string };
    expect(corpo.stato).toBe('chiusa');
    expect(corpo.esportataIl).toBeUndefined();

    await chiamaApi(`/api/sessioni/${sessione.id}/terminale.txt`, tenant.token);
    const riesportata = (await (
      await chiamaApi(`/api/sessioni/${sessione.id}`, tenant.token)
    ).json()) as { stato: string; esportataIl?: string };
    expect(riesportata.stato).toBe('esportata');
    expect(riesportata.esportataIl).toBeDefined();
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
  it('non lascia sovrascrivere una sessione di un altro tenant con lo stesso id', async () => {
    const primo = await creaTenant(1);
    const secondo = await creaTenant(2);
    const sessione = sessioneDiProva();
    await chiamaApiConCorpo('POST', '/api/sessioni', primo.token, sessione);

    const intrusione = await chiamaApiConCorpo('POST', '/api/sessioni', secondo.token, {
      ...sessione,
      nome: 'Sostituita',
    });
    expect(intrusione.status).toBe(409);

    const originale = (await (
      await chiamaApi(`/api/sessioni/${sessione.id}`, primo.token)
    ).json()) as { nome: string; righe: unknown[] };
    expect(originale.nome).toBe('Scaffale A');
    expect(originale.righe).toHaveLength(2);
  });

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

describe('DDT: cliente e numero documento (v2)', () => {
  it('rifiuta un ddt senza cliente', async () => {
    const tenant = await creaTenant();
    const sessione = sessioneDdtDiProva({ cliente: undefined });
    const risposta = await chiamaApiConCorpo('POST', '/api/sessioni', tenant.token, sessione);
    expect(risposta.status).toBe(400);
    expect((await risposta.json()) as { errore: string }).toMatchObject({
      errore: expect.stringContaining('cliente'),
    });
  });

  it('assegna il numero alla prima ricezione e lo mantiene su un upsert successivo', async () => {
    const tenant = await creaTenant();
    const sessione = sessioneDdtDiProva();

    const creazione = await chiamaApiConCorpo('POST', '/api/sessioni', tenant.token, sessione);
    expect(creazione.status).toBe(201);
    const corpo = (await creazione.json()) as { numeroDocumento: number };
    expect(corpo.numeroDocumento).toBe(1);

    const dettaglio = (await (
      await chiamaApi(`/api/sessioni/${sessione.id}`, tenant.token)
    ).json()) as { numeroDocumento: number; cliente: { nome: string } };
    expect(dettaglio.numeroDocumento).toBe(1);
    expect(dettaglio.cliente.nome).toBe(clienteDocumentoDiProva().nome);

    // Un secondo invio (riapertura e richiusura sul telefono) non cambia il numero.
    const secondaRisposta = await chiamaApiConCorpo(
      'POST',
      '/api/sessioni',
      tenant.token,
      sessioneDdtDiProva({ nome: 'Ordine 1 bis' }),
    );
    const secondoCorpo = (await secondaRisposta.json()) as { numeroDocumento: number };
    expect(secondoCorpo.numeroDocumento).toBe(1);
  });

  it('due ddt dello stesso tenant ricevono numeri progressivi distinti', async () => {
    const tenant = await creaTenant();
    const prima = await chiamaApiConCorpo(
      'POST',
      '/api/sessioni',
      tenant.token,
      sessioneDdtDiProva({ id: 'ddt-a' }),
    );
    const seconda = await chiamaApiConCorpo(
      'POST',
      '/api/sessioni',
      tenant.token,
      sessioneDdtDiProva({ id: 'ddt-b' }),
    );
    expect((await prima.json()) as { numeroDocumento: number }).toMatchObject({
      numeroDocumento: 1,
    });
    expect((await seconda.json()) as { numeroDocumento: number }).toMatchObject({
      numeroDocumento: 2,
    });
  });

  it('due POST ddt concorrenti dello stesso tenant ricevono numeri diversi', async () => {
    const tenant = await creaTenant();
    const [prima, seconda] = await Promise.all([
      chiamaApiConCorpo('POST', '/api/sessioni', tenant.token, sessioneDdtDiProva({ id: 'ddt-a' })),
      chiamaApiConCorpo('POST', '/api/sessioni', tenant.token, sessioneDdtDiProva({ id: 'ddt-b' })),
    ]);
    const numeroA = ((await prima.json()) as { numeroDocumento: number }).numeroDocumento;
    const numeroB = ((await seconda.json()) as { numeroDocumento: number }).numeroDocumento;
    expect(new Set([numeroA, numeroB])).toEqual(new Set([1, 2]));
  });

  it('una sessione non ddt non riceve un numero documento', async () => {
    const tenant = await creaTenant();
    const risposta = await chiamaApiConCorpo(
      'POST',
      '/api/sessioni',
      tenant.token,
      sessioneDiProva(),
    );
    const corpo = (await risposta.json()) as { numeroDocumento?: number };
    expect(corpo.numeroDocumento).toBeUndefined();
  });

  it('due tenant diversi numerano ciascuno a partire da 1', async () => {
    const primo = await creaTenant(1);
    const secondo = await creaTenant(2);
    const rispostaPrimo = await chiamaApiConCorpo(
      'POST',
      '/api/sessioni',
      primo.token,
      sessioneDdtDiProva({ id: 'ddt-primo' }),
    );
    const rispostaSecondo = await chiamaApiConCorpo(
      'POST',
      '/api/sessioni',
      secondo.token,
      sessioneDdtDiProva({ id: 'ddt-secondo' }),
    );
    expect((await rispostaPrimo.json()) as { numeroDocumento: number }).toMatchObject({
      numeroDocumento: 1,
    });
    expect((await rispostaSecondo.json()) as { numeroDocumento: number }).toMatchObject({
      numeroDocumento: 1,
    });
  });
});

describe('DELETE /api/sessioni/:id', () => {
  it('cancella una sessione ancora chiusa', async () => {
    const tenant = await creaTenant();
    const sessione = sessioneDiProva();
    await chiamaApiConCorpo('POST', '/api/sessioni', tenant.token, sessione);

    const risposta = await chiamaApiMetodo('DELETE', `/api/sessioni/${sessione.id}`, tenant.token);
    expect(risposta.status).toBe(204);

    const dopo = await chiamaApi(`/api/sessioni/${sessione.id}`, tenant.token);
    expect(dopo.status).toBe(404);
  });

  it('rifiuta con 409 una sessione già esportata', async () => {
    const tenant = await creaTenant();
    const sessione = sessioneDiProva();
    await chiamaApiConCorpo('POST', '/api/sessioni', tenant.token, sessione);
    await chiamaApi(`/api/sessioni/${sessione.id}/terminale.txt`, tenant.token);

    const risposta = await chiamaApiMetodo('DELETE', `/api/sessioni/${sessione.id}`, tenant.token);
    expect(risposta.status).toBe(409);

    // Non è stata toccata: resta esportata e recuperabile.
    const dopo = await chiamaApi(`/api/sessioni/${sessione.id}`, tenant.token);
    expect(dopo.status).toBe(200);
  });

  it('rifiuta con 409 una sessione già importata', async () => {
    const tenant = await creaTenant();
    const sessione = sessioneDiProva();
    await chiamaApiConCorpo('POST', '/api/sessioni', tenant.token, sessione);
    await chiamaApiConCorpo('PATCH', `/api/sessioni/${sessione.id}`, tenant.token, {
      stato: 'esportata',
    });
    await chiamaApiConCorpo('PATCH', `/api/sessioni/${sessione.id}`, tenant.token, {
      stato: 'importata',
    });

    const risposta = await chiamaApiMetodo('DELETE', `/api/sessioni/${sessione.id}`, tenant.token);
    expect(risposta.status).toBe(409);
  });

  it('risponde 404 per una sessione inesistente', async () => {
    const tenant = await creaTenant();
    const risposta = await chiamaApiMetodo('DELETE', '/api/sessioni/non-esiste', tenant.token);
    expect(risposta.status).toBe(404);
  });

  it('non cancella la sessione di un altro tenant', async () => {
    const primo = await creaTenant(1);
    const secondo = await creaTenant(2);
    const sessione = sessioneDiProva();
    await chiamaApiConCorpo('POST', '/api/sessioni', primo.token, sessione);

    const risposta = await chiamaApiMetodo('DELETE', `/api/sessioni/${sessione.id}`, secondo.token);
    expect(risposta.status).toBe(404);

    const ancoraLi = await chiamaApi(`/api/sessioni/${sessione.id}`, primo.token);
    expect(ancoraLi.status).toBe(200);
  });

  it("richiede l'autenticazione", async () => {
    const tenant = await creaTenant();
    const sessione = sessioneDiProva();
    await chiamaApiConCorpo('POST', '/api/sessioni', tenant.token, sessione);
    expect((await chiamaApiMetodo('DELETE', `/api/sessioni/${sessione.id}`, null)).status).toBe(
      401,
    );
  });
});
