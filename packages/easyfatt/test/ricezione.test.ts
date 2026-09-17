import { describe, expect, it } from 'vitest';
import { analizzaParametriRicezione, ErroreRicezione } from '../src/index.js';

describe('analizzaParametriRicezione', () => {
  it('legge tutti i parametri del polling', () => {
    expect(
      analizzaParametriRicezione({
        appver: '2',
        firstdate: '2026-09-01',
        lastdate: '2026-09-30',
        firstnum: '41',
        lastnum: '100',
      }),
    ).toEqual({
      appver: '2',
      firstdate: '2026-09-01',
      lastdate: '2026-09-30',
      firstnum: 41,
      lastnum: 100,
    });
  });

  it('parametri assenti o vuoti restano undefined', () => {
    expect(analizzaParametriRicezione({})).toEqual({});
    expect(
      analizzaParametriRicezione({ appver: '2', firstnum: '', lastdate: ' ', lastnum: undefined }),
    ).toEqual({ appver: '2' });
  });

  it('accetta il 29 febbraio di un anno bisestile', () => {
    expect(analizzaParametriRicezione({ firstdate: '2028-02-29' }).firstdate).toBe('2028-02-29');
  });

  it.each([
    [
      'firstdate',
      '2026-02-30',
      'Parametro firstdate non valido: "2026-02-30". Serve una data nel formato aaaa-mm-gg.',
    ],
    [
      'lastdate',
      '17/09/2026',
      'Parametro lastdate non valido: "17/09/2026". Serve una data nel formato aaaa-mm-gg.',
    ],
    [
      'firstdate',
      '2026-13-01',
      'Parametro firstdate non valido: "2026-13-01". Serve una data nel formato aaaa-mm-gg.',
    ],
    ['firstnum', '0', 'Parametro firstnum non valido: "0". Serve un numero intero da 1 in su.'],
    ['lastnum', '-3', 'Parametro lastnum non valido: "-3". Serve un numero intero da 1 in su.'],
    ['firstnum', '1.5', 'Parametro firstnum non valido: "1.5". Serve un numero intero da 1 in su.'],
    ['lastnum', 'abc', 'Parametro lastnum non valido: "abc". Serve un numero intero da 1 in su.'],
    [
      'firstnum',
      '99999999999999999999',
      'Parametro firstnum non valido: "99999999999999999999". Serve un numero intero da 1 in su.',
    ],
  ])('rifiuta %s = %s', (nome, valore, messaggio) => {
    const analizza = () => analizzaParametriRicezione({ [nome]: valore });
    expect(analizza).toThrow(ErroreRicezione);
    expect(analizza).toThrow(messaggio);
  });
});
