import { describe, expect, it } from 'vitest';
import { descriviVersione, VERSIONE_APP } from '../src/versione.js';

describe('versione', () => {
  it('il bundle porta numero, commit e data di build', () => {
    expect(VERSIONE_APP.numero).toMatch(/^\d+\.\d+\.\d+/);
    expect(VERSIONE_APP.commit).toMatch(/^[0-9a-f]{7}$|^sviluppo$/);
    expect(Number.isNaN(Date.parse(VERSIONE_APP.data))).toBe(false);
  });

  it('descrive la versione con numero, commit e data leggibile', () => {
    expect(
      descriviVersione({ numero: '0.1.0', commit: '1f0b0ea', data: '2026-09-17T13:32:00.000Z' }),
    ).toMatch(/^Versione 0\.1\.0 · build 1f0b0ea del 17\/09\/2026, \d\d:\d\d$/);
  });
});
