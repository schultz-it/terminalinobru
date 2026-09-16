import { describe, expect, it } from 'vitest';
import { analizzaStringaFormato, LETTERE_AMMESSE } from '../src/index.js';

/** Restituisce l'errore di una stringa formato, fallendo se invece è valida. */
function erroreDi(stringa: string): string {
  const esito = analizzaStringaFormato(stringa);
  if (esito.ok) throw new Error(`"${stringa}" è stata accettata invece di essere rifiutata`);
  return esito.errore;
}

describe('analizzaStringaFormato, campi delimitati', () => {
  it('riconosce il formato predefinito A,Q', () => {
    expect(analizzaStringaFormato('A,Q')).toEqual({
      ok: true,
      tipo: 'delimitato',
      separatore: ',',
      campi: ['A', 'Q'],
    });
  });

  it('riconosce gli altri separatori documentati', () => {
    expect(analizzaStringaFormato('A;Q')).toMatchObject({ separatore: ';' });
    expect(analizzaStringaFormato('A/Q/L/S')).toEqual({
      ok: true,
      tipo: 'delimitato',
      separatore: '/',
      campi: ['A', 'Q', 'L', 'S'],
    });
  });

  it('interpreta § come tabulazione, come nella UI di Easyfatt', () => {
    expect(analizzaStringaFormato('A§Q')).toMatchObject({ separatore: '\t' });
    expect(analizzaStringaFormato('A\tQ')).toMatchObject({ separatore: '\t' });
  });

  it('ammette i campi da ignorare, anche ripetuti', () => {
    expect(analizzaStringaFormato('X,A,X,Q')).toEqual({
      ok: true,
      tipo: 'delimitato',
      separatore: ',',
      campi: ['X', 'A', 'X', 'Q'],
    });
  });

  it('rifiuta un campo di più lettere', () => {
    expect(erroreDi('AA;Q')).toContain('una sola lettera');
  });

  it('rifiuta un campo vuoto', () => {
    expect(erroreDi('A,,Q')).toContain('campo vuoto');
    expect(erroreDi('A,Q,')).toContain('campo vuoto');
    expect(erroreDi(',A,Q')).toContain('campo vuoto');
  });

  it('rifiuta più separatori diversi', () => {
    expect(erroreDi('A,Q;L')).toContain('più separatori diversi');
    expect(erroreDi('A§Q;L')).toContain('"\\t"');
  });

  it('rifiuta una lettera non ammessa', () => {
    expect(erroreDi('A,Z,Q')).toContain('Carattere non ammesso "Z"');
    expect(erroreDi('A,Z,Q')).toContain(LETTERE_AMMESSE.join(' '));
  });

  it('rifiuta q nei campi delimitati', () => {
    expect(erroreDi('A,Q,q')).toContain('solo nel formato a spaziatura fissa');
  });
});

describe('analizzaStringaFormato, spaziatura fissa', () => {
  it('raggruppa le lettere uguali in campi con lunghezza', () => {
    expect(analizzaStringaFormato('AAAAQQQqq')).toEqual({
      ok: true,
      tipo: 'fisso',
      campi: [
        { lettera: 'A', lunghezza: 4 },
        { lettera: 'Q', lunghezza: 3 },
        { lettera: 'q', lunghezza: 2 },
      ],
    });
  });

  it('ammette lotto, scadenza e riempimenti da ignorare', () => {
    expect(analizzaStringaFormato('AAAAAAQQQXXLLLLSSSSSSSS')).toMatchObject({
      tipo: 'fisso',
      campi: [
        { lettera: 'A', lunghezza: 6 },
        { lettera: 'Q', lunghezza: 3 },
        { lettera: 'X', lunghezza: 2 },
        { lettera: 'L', lunghezza: 4 },
        { lettera: 'S', lunghezza: 8 },
      ],
    });
  });

  it('rifiuta un carattere non ammesso', () => {
    expect(erroreDi('AAAZQQQ')).toContain('Carattere non ammesso "Z"');
  });

  it('rifiuta lo stesso campo in due posizioni diverse', () => {
    expect(erroreDi('AAQQAA')).toContain('è ripetuto');
  });

  it('rifiuta i decimali senza la parte intera', () => {
    expect(erroreDi('AAAqq')).toContain('il campo Q (quantità)');
  });
});

describe('analizzaStringaFormato, campi obbligatori', () => {
  it('rifiuta la stringa vuota', () => {
    expect(erroreDi('')).toBe('La stringa formato è vuota.');
  });

  it('rifiuta spazi ai bordi', () => {
    expect(erroreDi(' A,Q')).toContain('spazio');
    expect(erroreDi('A,Q ')).toContain('spazio');
  });

  it('rifiuta una stringa senza A', () => {
    expect(erroreDi('Q,L')).toContain('campo A');
    expect(erroreDi('QQQ')).toContain('campo A');
  });

  it('rifiuta una stringa senza Q', () => {
    expect(erroreDi('A,L')).toContain('campo Q');
    expect(erroreDi('AAA')).toContain('campo Q');
  });
});
