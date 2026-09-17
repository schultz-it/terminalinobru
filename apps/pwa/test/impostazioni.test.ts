import { IMPOSTAZIONI_DEFAULT } from '@terminalinobru/core';
import { afterEach, describe, expect, it } from 'vitest';
import type { DatabaseTerminalino } from '../src/db.js';
import {
  analizzaTestoSetup,
  caricaImpostazioni,
  componiImpostazioni,
  salvaImpostazioni,
  validaImpostazioni,
} from '../src/impostazioni.js';
import { nuovoDb } from './aiuti.js';

let db: DatabaseTerminalino | undefined;
afterEach(async () => {
  await db?.delete();
  db = undefined;
});

describe('validaImpostazioni', () => {
  it('le impostazioni di default sono valide', () => {
    expect(validaImpostazioni(IMPOSTAZIONI_DEFAULT)).toEqual({});
  });

  it('usa analizzaStringaFormato e ne riporta il messaggio', () => {
    expect(
      validaImpostazioni({ ...IMPOSTAZIONI_DEFAULT, stringaFormato: 'A,L' }).stringaFormato,
    ).toBe('La stringa formato deve contenere il campo Q (quantità).');
    expect(validaImpostazioni({ ...IMPOSTAZIONI_DEFAULT, stringaFormato: '' }).stringaFormato).toBe(
      'La stringa formato è vuota.',
    );
    expect(validaImpostazioni({ ...IMPOSTAZIONI_DEFAULT, stringaFormato: 'AAAAQQQqq' })).toEqual(
      {},
    );
  });

  it("controlla l'indirizzo del bridge", () => {
    const con = (urlBridge: string) =>
      validaImpostazioni({ ...IMPOSTAZIONI_DEFAULT, urlBridge }).urlBridge;
    expect(con('')).toBeUndefined();
    expect(con('https://bridge.esempio.it')).toBeUndefined();
    expect(con('http://localhost:8787')).toBeUndefined();
    expect(con('bridge.esempio.it')).toMatch(/non valido/);
    expect(con('ftp://bridge.esempio.it')).toMatch(/https/);
  });

  it('controlla token, listino e nome dispositivo', () => {
    const errori = validaImpostazioni({
      ...IMPOSTAZIONI_DEFAULT,
      token: 'due parole',
      listinoMostrato: 10,
      dispositivo: 'x'.repeat(41),
    });
    expect(Object.keys(errori).sort()).toEqual(['dispositivo', 'listinoMostrato', 'token']);
  });
});

describe('persistenza delle impostazioni', () => {
  it('parte dai default e salva per chiave', async () => {
    db = nuovoDb();
    expect(await caricaImpostazioni(db)).toEqual(IMPOSTAZIONI_DEFAULT);
    await salvaImpostazioni(db, { token: 'abc', listinoMostrato: 3, suoni: false });
    expect(await caricaImpostazioni(db)).toEqual({
      ...IMPOSTAZIONI_DEFAULT,
      token: 'abc',
      listinoMostrato: 3,
      suoni: false,
    });
  });

  it('un valore salvato illeggibile torna al default senza perdere gli altri', () => {
    expect(
      componiImpostazioni([
        { chiave: 'listinoMostrato', valore: 42 },
        { chiave: 'token', valore: 'abc' },
        { chiave: 'separatoreDecimale', valore: ';' },
        { chiave: 'cursoreCatalogo', valore: '2026-09-16T00:00:00Z' },
      ]),
    ).toEqual({ ...IMPOSTAZIONI_DEFAULT, token: 'abc' });
  });
});

describe('analizzaTestoSetup', () => {
  it('legge url e token dal testo del QR', () => {
    expect(
      analizzaTestoSetup(
        ' terminalinobru://setup?url=https%3A%2F%2Fbridge.esempio.it%2F&token=abc123 ',
      ),
    ).toEqual({ ok: true, dati: { urlBridge: 'https://bridge.esempio.it', token: 'abc123' } });
  });

  it('rifiuta testi estranei o incompleti con un messaggio', () => {
    expect(analizzaTestoSetup('https://bridge.esempio.it')).toMatchObject({ ok: false });
    expect(analizzaTestoSetup('terminalinobru://setupx?url=https://a.it&token=t')).toMatchObject({
      ok: false,
    });
    expect(analizzaTestoSetup('terminalinobru://setup?token=abc')).toEqual({
      ok: false,
      errore: "Nel codice di setup manca l'indirizzo del bridge.",
    });
    expect(analizzaTestoSetup('terminalinobru://setup?url=https://a.it')).toEqual({
      ok: false,
      errore: 'Nel codice di setup manca il token.',
    });
    expect(analizzaTestoSetup('terminalinobru://setup?url=nonvalido&token=abc')).toMatchObject({
      ok: false,
    });
  });
});
