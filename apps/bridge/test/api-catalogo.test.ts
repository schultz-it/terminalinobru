import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { Barcode, Prodotto } from '@terminalinobru/core';
import catalogoFullV2 from '../../../packages/easyfatt/test/fixture/catalogo-full-v2.xml?raw';
import catalogoFullV3 from '../../../packages/easyfatt/test/fixture/catalogo-full-v3-varianti.xml?raw';
import catalogoIncremental from '../../../packages/easyfatt/test/fixture/catalogo-incremental.xml?raw';
import { chiamaApi, creaTenant, inviaCatalogo } from './aiuti.js';
import type { TenantDiProva } from './aiuti.js';
import { LIMITE_PRODOTTI_RISPOSTA } from '../src/rotte-api.js';

/** Forma della risposta di `GET /api/catalogo`. */
interface RispostaCatalogo {
  aggiornatoIl: string;
  prodotti: Prodotto[];
  barcode: Barcode[];
  prodottiEliminati: string[];
  barcodeEliminati: string[];
}

/** Scarica il catalogo, eventualmente a partire da una data. */
async function scaricaCatalogo(
  tenant: TenantDiProva,
  dal?: string,
): Promise<{ stato: number; corpo: RispostaCatalogo }> {
  const percorso =
    dal === undefined ? '/api/catalogo' : `/api/catalogo?dal=${encodeURIComponent(dal)}`;
  const risposta = await chiamaApi(percorso, tenant.token);
  return { stato: risposta.status, corpo: (await risposta.json()) as RispostaCatalogo };
}

describe('GET /api/stato', () => {
  it('riporta nome, data ultimo catalogo e numero di prodotti', async () => {
    const tenant = await creaTenant();
    const vuoto = await chiamaApi('/api/stato', tenant.token);
    expect(await vuoto.json()).toEqual({
      nome: tenant.nome,
      ultimoCatalogoIl: null,
      prodotti: 0,
    });

    await inviaCatalogo(tenant, catalogoFullV2);
    const pieno = (await (await chiamaApi('/api/stato', tenant.token)).json()) as {
      nome: string;
      ultimoCatalogoIl: string | null;
      prodotti: number;
    };
    expect(pieno.prodotti).toBe(3);
    expect(pieno.ultimoCatalogoIl).not.toBeNull();
  });

  it('non conta i prodotti eliminati', async () => {
    const tenant = await creaTenant();
    await inviaCatalogo(tenant, catalogoFullV2);
    await inviaCatalogo(tenant, catalogoFullV3);
    const corpo = (await (await chiamaApi('/api/stato', tenant.token)).json()) as {
      prodotti: number;
    };
    expect(corpo.prodotti).toBe(2);
  });
});

describe('GET /api/catalogo', () => {
  it('senza dal restituisce tutti i non eliminati e nessun tombstone', async () => {
    const tenant = await creaTenant();
    await inviaCatalogo(tenant, catalogoFullV2);
    await inviaCatalogo(tenant, catalogoIncremental);

    const { stato, corpo } = await scaricaCatalogo(tenant);
    expect(stato).toBe(200);
    expect(corpo.prodotti.map((p) => p.codice)).toEqual(['FILM500']);
    expect(corpo.prodottiEliminati).toEqual([]);
    expect(corpo.barcodeEliminati).toEqual([]);
    expect(corpo.barcode.map((b) => b.barcode)).toEqual(['8009876543210']);
  });

  it('restituisce i prodotti nella forma di dominio, con i listini come array', async () => {
    const tenant = await creaTenant();
    await inviaCatalogo(tenant, catalogoFullV2);

    const { corpo } = await scaricaCatalogo(tenant);
    const bancale = corpo.prodotti.find((p) => p.codice === '+banp_1200800p');
    expect(bancale).toMatchObject({
      descrizione: 'Bancale in plastica 1200x800',
      categoria: 'Bancali',
      sottocategoria: 'Plastica',
      um: 'pz',
      ivaPerc: 22,
      gestioneMagazzino: true,
      ubicazione: 'A-03',
      scortaMinima: 10,
      giacenza: 17,
      ordinato: 0,
      fornitore: 'Fornitore Srl',
      codiceFornitore: 'ABC',
      note: 'Bancale lavabile',
    });
    expect(bancale?.prezziNetti).toEqual([30.33, 28.5, null, null, null, null, null, null, 25]);
    expect(bancale?.prezziLordi).toEqual([37, 34.77, null, null, null, null, null, null, null]);
    expect(bancale).not.toHaveProperty('eliminatoIl');

    const scatola = corpo.prodotti.find((p) => p.codice === 'SCAT-30');
    expect(scatola).not.toHaveProperty('categoria');
    expect(scatola).not.toHaveProperty('giacenza');

    const conPacco = corpo.barcode.find((b) => b.barcode === 'XY981');
    expect(conPacco).toMatchObject({ quantitaConfezione: 12, origine: 'easyfatt' });
    const senzaPacco = corpo.barcode.find((b) => b.barcode === '90273782');
    expect(senzaPacco).not.toHaveProperty('quantitaConfezione');
  });

  it('con dal restituisce solo le modifiche successive e i tombstone', async () => {
    const tenant = await creaTenant();
    await inviaCatalogo(tenant, catalogoFullV2);
    const primo = await scaricaCatalogo(tenant);
    expect(primo.corpo.prodotti).toHaveLength(3);

    // Subito dopo, senza altri invii, il delta è vuoto.
    const vuoto = await scaricaCatalogo(tenant, primo.corpo.aggiornatoIl);
    expect(vuoto.corpo.prodotti).toEqual([]);
    expect(vuoto.corpo.barcode).toEqual([]);
    expect(vuoto.corpo.prodottiEliminati).toEqual([]);

    await inviaCatalogo(tenant, catalogoIncremental);
    const delta = await scaricaCatalogo(tenant, primo.corpo.aggiornatoIl);
    expect(delta.corpo.prodotti.map((p) => p.codice)).toEqual(['FILM500']);
    expect(delta.corpo.prodottiEliminati).toEqual(['+banp_1200800p', 'SCAT-30']);
    expect(delta.corpo.barcodeEliminati).toEqual(['8001234567890', '90273782', 'XY981']);
  });

  it('usa come cursore la data dell ultimo invio riuscito, non l orologio del bridge', async () => {
    const tenant = await creaTenant();
    const senzaCatalogo = await scaricaCatalogo(tenant);
    expect(Number.isNaN(Date.parse(senzaCatalogo.corpo.aggiornatoIl))).toBe(false);

    await inviaCatalogo(tenant, catalogoFullV2);
    const dopoInvio = await scaricaCatalogo(tenant);
    const stato = (await (await chiamaApi('/api/stato', tenant.token)).json()) as {
      ultimoCatalogoIl: string;
    };
    expect(dopoInvio.corpo.aggiornatoIl).toBe(stato.ultimoCatalogoIl);
    // Rispedito come dal, il cursore non fa perdere né ripetere nulla.
    const delta = await scaricaCatalogo(tenant, dopoInvio.corpo.aggiornatoIl);
    expect(delta.corpo.prodotti).toEqual([]);
    expect(delta.corpo.aggiornatoIl).toBe(stato.ultimoCatalogoIl);
  });

  it('rifiuta un parametro dal che non è una data', async () => {
    const tenant = await creaTenant();
    const risposta = await chiamaApi('/api/catalogo?dal=ieri', tenant.token);
    expect(risposta.status).toBe(400);
    expect(await risposta.json()).toEqual({
      errore: 'Parametro «dal» non valido: attesa una data ISO 8601.',
    });
  });

  it('tratta un dal vuoto come assente', async () => {
    const tenant = await creaTenant();
    await inviaCatalogo(tenant, catalogoFullV2);
    const risposta = await chiamaApi('/api/catalogo?dal=', tenant.token);
    expect(risposta.status).toBe(200);
    expect(((await risposta.json()) as RispostaCatalogo).prodotti).toHaveLength(3);
  });

  it('non restituisce il catalogo di un altro tenant', async () => {
    const primo = await creaTenant(1);
    const secondo = await creaTenant(2);
    await inviaCatalogo(primo, catalogoFullV2);

    const { corpo } = await scaricaCatalogo(secondo);
    expect(corpo.prodotti).toEqual([]);
    expect(corpo.barcode).toEqual([]);
  });

  it(`risponde 413 oltre ${LIMITE_PRODOTTI_RISPOSTA} prodotti`, async () => {
    const tenant = await creaTenant();
    await env.DB.prepare(
      `INSERT INTO prodotto (tenant_id, codice, descrizione, prezzi_netti, prezzi_lordi,
         gestione_magazzino, aggiornato_il)
       WITH RECURSIVE numeri(n) AS (
         SELECT 1 UNION ALL SELECT n + 1 FROM numeri WHERE n < ?2
       )
       SELECT ?1, 'P' || n, 'Prodotto ' || n, '[]', '[]', 1, '2026-02-01T00:00:00.000Z' FROM numeri`,
    )
      .bind(tenant.id, LIMITE_PRODOTTI_RISPOSTA + 1)
      .run();

    const risposta = await chiamaApi('/api/catalogo', tenant.token);
    expect(risposta.status).toBe(413);
    const corpo = (await risposta.json()) as { errore: string };
    expect(corpo.errore).toMatch(new RegExp(String(LIMITE_PRODOTTI_RISPOSTA + 1)));
    expect(corpo.errore).toMatch(/dal/);
  });
});
