import { afterEach, describe, expect, it } from 'vitest';
import { creaClienteApp } from '../src/clienti/operazioni.js';
import type { DatabaseTerminalino } from '../src/db.js';
import {
  aggiungiRiga,
  cambiaClienteSessione,
  chiudiSessione,
  creaSessione,
  sessioneCompleta,
  validaNuovaSessione,
} from '../src/sessioni/operazioni.js';
import { nuovoDb } from './aiuti.js';

let db: DatabaseTerminalino;
afterEach(async () => {
  await db?.delete();
});

const ceramiche = { codice: '0018', nome: 'Ceramiche Italiane', partitaIva: '03322350178' };

describe('validaNuovaSessione', () => {
  it('per un DDT chiede il cliente', () => {
    expect(validaNuovaSessione({ tipo: 'ddt', nome: 'DDT', modalita: 'chiedi_quantita' })).toBe(
      'Scegli il cliente del DDT.',
    );
    expect(
      validaNuovaSessione({
        tipo: 'ddt',
        nome: 'DDT',
        modalita: 'chiedi_quantita',
        cliente: ceramiche,
      }),
    ).toBeUndefined();
  });

  it('rifiuta un cliente con dati non validi', () => {
    expect(
      validaNuovaSessione({
        tipo: 'ddt',
        nome: 'DDT',
        modalita: 'somma_uno',
        cliente: { nome: 'X', partitaIva: '123' },
      }),
    ).toContain('non sono validi');
  });

  it('non chiede il cliente per inventario e carico, e il nome resta obbligatorio', () => {
    expect(
      validaNuovaSessione({ tipo: 'inventario', nome: 'A', modalita: 'somma_uno' }),
    ).toBeUndefined();
    expect(
      validaNuovaSessione({ tipo: 'carico', nome: 'A', modalita: 'somma_uno' }),
    ).toBeUndefined();
    expect(
      validaNuovaSessione({ tipo: 'ddt', nome: '  ', modalita: 'somma_uno', cliente: ceramiche }),
    ).toBe('Dai un nome alla sessione.');
  });
});

describe('creaSessione di tipo DDT', () => {
  it('senza cliente non crea nulla', async () => {
    db = nuovoDb();
    await expect(
      creaSessione(db, { tipo: 'ddt', nome: 'DDT', modalita: 'chiedi_quantita' }),
    ).rejects.toThrow('Scegli il cliente del DDT.');
    expect(await db.sessioni.count()).toBe(0);
  });

  it('salva la copia completa del cliente, che viaggia verso il bridge', async () => {
    db = nuovoDb();
    const sessione = await creaSessione(db, {
      tipo: 'ddt',
      nome: 'DDT',
      modalita: 'chiedi_quantita',
      cliente: ceramiche,
    });
    await aggiungiRiga(db, sessione.id, { codiceProdotto: 'A1', quantita: 2 });
    await chiudiSessione(db, sessione.id);
    expect((await sessioneCompleta(db, sessione.id))?.cliente).toEqual(ceramiche);
  });

  it('non mette il cliente negli altri tipi', async () => {
    db = nuovoDb();
    const sessione = await creaSessione(db, {
      tipo: 'inventario',
      nome: 'Scaffale',
      modalita: 'chiedi_quantita',
      cliente: ceramiche,
    });
    expect(sessione.cliente).toBeUndefined();
  });

  it('un DDT aperto senza cliente (nato prima della v2) non si chiude finché non lo si sceglie', async () => {
    db = nuovoDb();
    await db.sessioni.add({
      id: 'vecchio',
      tipo: 'ddt',
      nome: 'DDT v1',
      stato: 'aperta',
      modalita: 'chiedi_quantita',
      creataIl: '2026-09-10T08:00:00.000Z',
    });
    await aggiungiRiga(db, 'vecchio', { codiceProdotto: 'A1', quantita: 1 });
    await expect(chiudiSessione(db, 'vecchio')).rejects.toThrow('Scegli il cliente del DDT.');
    expect(await db.codaUpload.count()).toBe(0);

    await cambiaClienteSessione(db, 'vecchio', ceramiche);
    await chiudiSessione(db, 'vecchio');
    expect(await db.sessioni.get('vecchio')).toMatchObject({ stato: 'chiusa', cliente: ceramiche });
  });

  it('il cliente si cambia solo su un DDT aperto e con dati validi', async () => {
    db = nuovoDb();
    const inventario = await creaSessione(db, {
      tipo: 'inventario',
      nome: 'Scaffale',
      modalita: 'chiedi_quantita',
    });
    await expect(cambiaClienteSessione(db, inventario.id, ceramiche)).rejects.toThrow('Solo i DDT');
    await expect(cambiaClienteSessione(db, inventario.id, { nome: '' })).rejects.toThrow(
      'non sono validi',
    );
  });
});

describe('creaClienteApp', () => {
  it('valida, pulisce e salva con origine app e un UUID come id, senza codice', async () => {
    db = nuovoDb();
    const esito = await creaClienteApp(
      db,
      {
        nome: '  Nuovo Cliente srl ',
        partitaIva: '01234567890',
        codiceFiscale: '',
        provincia: 'fc',
        sdi: 'm5uxcr1',
        email: 'ordini@nuovo.it',
      },
      new Date('2026-09-17T10:00:00.000Z'),
      () => '6f1c1c9e-0000-4000-8000-000000000001',
    );
    const atteso = {
      id: '6f1c1c9e-0000-4000-8000-000000000001',
      origine: 'app',
      nome: 'Nuovo Cliente srl',
      partitaIva: '01234567890',
      provincia: 'FC',
      sdi: 'M5UXCR1',
      email: 'ordini@nuovo.it',
      aggiornatoIl: '2026-09-17T10:00:00.000Z',
    };
    expect(esito).toEqual({ ok: true, cliente: atteso });
    expect(await db.clienti.get(atteso.id)).toEqual(atteso);
  });

  it('senza ragione sociale o con campi errati non salva e spiega campo per campo', async () => {
    db = nuovoDb();
    const esito = await creaClienteApp(db, {
      nome: ' ',
      partitaIva: '123',
      provincia: 'Forlì',
      email: 'nonvalida',
    });
    expect(esito.ok).toBe(false);
    if (esito.ok) return;
    expect(Object.keys(esito.errori).sort()).toEqual(['email', 'nome', 'partitaIva', 'provincia']);
    expect(esito.errori.nome).toBe('La ragione sociale è obbligatoria.');
    expect(await db.clienti.count()).toBe(0);
  });
});
