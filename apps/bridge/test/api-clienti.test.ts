import { describe, expect, it } from 'vitest';
import { LIMITE_BYTE_IMPORTAZIONE, LIMITE_CLIENTI_IMPORTAZIONE } from '../src/rotte-clienti.js';
import { chiama, chiamaApi, chiamaApiConCorpo, clienteDiProva, creaTenant } from './aiuti.js';

describe('POST /api/clienti/importa', () => {
  it('importa clienti e li ritrova in GET /api/clienti', async () => {
    const tenant = await creaTenant();
    const risposta = await chiamaApiConCorpo('POST', '/api/clienti/importa', tenant.token, {
      clienti: [clienteDiProva(), clienteDiProva({ id: 'C002', nome: 'Legnami Rossi' })],
    });
    expect(risposta.status).toBe(200);
    expect(await risposta.json()).toEqual({ importati: 2, eliminati: 0 });

    const elenco = (await (await chiamaApi('/api/clienti', tenant.token)).json()) as {
      clienti: { id: string; nome: string }[];
    };
    expect(elenco.clienti.map((c) => c.id).sort()).toEqual(['C001', 'C002']);
    expect(elenco.clienti.find((c) => c.id === 'C002')?.nome).toBe('Legnami Rossi');
  });

  it('un secondo invio senza un cliente lo elimina (tombstone come il catalogo full)', async () => {
    const tenant = await creaTenant();
    await chiamaApiConCorpo('POST', '/api/clienti/importa', tenant.token, {
      clienti: [clienteDiProva({ id: 'C001' }), clienteDiProva({ id: 'C002' })],
    });

    const seconda = await chiamaApiConCorpo('POST', '/api/clienti/importa', tenant.token, {
      clienti: [clienteDiProva({ id: 'C002' })],
    });
    expect(await seconda.json()).toEqual({ importati: 1, eliminati: 1 });

    const elenco = (await (await chiamaApi('/api/clienti', tenant.token)).json()) as {
      clienti: { id: string }[];
    };
    expect(elenco.clienti.map((c) => c.id)).toEqual(['C002']);
  });

  it('un cliente reinviato dopo essere sparito torna vivo', async () => {
    const tenant = await creaTenant();
    await chiamaApiConCorpo('POST', '/api/clienti/importa', tenant.token, {
      clienti: [clienteDiProva({ id: 'C001' })],
    });
    await chiamaApiConCorpo('POST', '/api/clienti/importa', tenant.token, { clienti: [] });
    await chiamaApiConCorpo('POST', '/api/clienti/importa', tenant.token, {
      clienti: [clienteDiProva({ id: 'C001', nome: 'Ceramiche Italiane Srl' })],
    });

    const elenco = (await (await chiamaApi('/api/clienti', tenant.token)).json()) as {
      clienti: { id: string; nome: string }[];
    };
    expect(elenco.clienti).toEqual([
      expect.objectContaining({ id: 'C001', nome: 'Ceramiche Italiane Srl' }),
    ]);
  });

  it('rifiuta un corpo che non rispetta lo schema del cliente', async () => {
    const tenant = await creaTenant();
    const risposta = await chiamaApiConCorpo('POST', '/api/clienti/importa', tenant.token, {
      clienti: [{ id: 'C001', origine: 'easyfatt' }], // senza nome, obbligatorio
    });
    expect(risposta.status).toBe(400);
  });

  it('dice quale cliente e quale campo non vanno', async () => {
    const tenant = await creaTenant();
    const risposta = await chiamaApiConCorpo('POST', '/api/clienti/importa', tenant.token, {
      clienti: [
        { id: 'C001', nome: 'Buono', origine: 'easyfatt', aggiornatoIl: '2026-09-17T10:00:00Z' },
        { id: '0716', nome: 'Rossi', provincia: 'FORLI', origine: 'easyfatt', aggiornatoIl: 'x' },
      ],
    });
    expect(risposta.status).toBe(400);
    expect(await risposta.json()).toEqual({
      errore: 'Cliente 0716 non valido (campo provincia): La provincia deve essere di 2 lettere.',
    });
  });

  it('rifiuta un corpo senza il campo clienti', async () => {
    const tenant = await creaTenant();
    const risposta = await chiamaApiConCorpo('POST', '/api/clienti/importa', tenant.token, {
      altro: [],
    });
    expect(risposta.status).toBe(400);
  });

  it('rifiuta un corpo che non è JSON valido', async () => {
    const tenant = await creaTenant();
    const risposta = await chiama(
      new Request('http://localhost/api/clienti/importa', {
        method: 'POST',
        headers: { authorization: `Bearer ${tenant.token}`, 'content-type': 'application/json' },
        body: '{non valido',
      }),
    );
    expect(risposta.status).toBe(400);
  });

  it('rifiuta più di 5000 clienti con 413', async () => {
    const tenant = await creaTenant();
    const clienti = Array.from({ length: LIMITE_CLIENTI_IMPORTAZIONE + 1 }, (_, indice) =>
      clienteDiProva({ id: `C${indice}` }),
    );
    const risposta = await chiamaApiConCorpo('POST', '/api/clienti/importa', tenant.token, {
      clienti,
    });
    expect(risposta.status).toBe(413);
  });

  it('rifiuta un corpo oltre il limite di byte con 413', async () => {
    const tenant = await creaTenant();
    const risposta = await chiamaApiConCorpo('POST', '/api/clienti/importa', tenant.token, {
      clienti: [clienteDiProva({ indirizzo: 'X'.repeat(LIMITE_BYTE_IMPORTAZIONE + 1) })],
    });
    expect(risposta.status).toBe(413);
  });

  it("richiede l'autenticazione", async () => {
    const risposta = await chiamaApiConCorpo('POST', '/api/clienti/importa', null, {
      clienti: [clienteDiProva()],
    });
    expect(risposta.status).toBe(401);
  });

  it('non mescola i clienti di due tenant diversi', async () => {
    const primo = await creaTenant(1);
    const secondo = await creaTenant(2);
    await chiamaApiConCorpo('POST', '/api/clienti/importa', primo.token, {
      clienti: [clienteDiProva({ id: 'SOLO-PRIMO' })],
    });

    const elencoSecondo = (await (await chiamaApi('/api/clienti', secondo.token)).json()) as {
      clienti: unknown[];
    };
    expect(elencoSecondo.clienti).toEqual([]);
  });
});

describe('GET /api/clienti', () => {
  it('con «dal» restituisce solo i clienti modificati dopo, più gli eliminati', async () => {
    const tenant = await creaTenant();
    await chiamaApiConCorpo('POST', '/api/clienti/importa', tenant.token, {
      clienti: [clienteDiProva({ id: 'C001' })],
    });
    const primaRisposta = (await (await chiamaApi('/api/clienti', tenant.token)).json()) as {
      aggiornatoIl: string;
    };

    await chiamaApiConCorpo('POST', '/api/clienti/importa', tenant.token, {
      clienti: [clienteDiProva({ id: 'C002' })],
    });

    const delta = (await (
      await chiamaApi(
        `/api/clienti?dal=${encodeURIComponent(primaRisposta.aggiornatoIl)}`,
        tenant.token,
      )
    ).json()) as { clienti: { id: string }[]; clientiEliminati: string[] };
    expect(delta.clienti.map((c) => c.id)).toEqual(['C002']);
    expect(delta.clientiEliminati).toEqual(['C001']);
  });

  it('rifiuta un «dal» non valido', async () => {
    const tenant = await creaTenant();
    const risposta = await chiamaApi('/api/clienti?dal=non-una-data', tenant.token);
    expect(risposta.status).toBe(400);
  });

  it("richiede l'autenticazione", async () => {
    const risposta = await chiamaApi('/api/clienti', null);
    expect(risposta.status).toBe(401);
  });
});
