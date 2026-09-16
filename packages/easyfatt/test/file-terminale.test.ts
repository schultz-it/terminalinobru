import { describe, expect, it } from 'vitest';
import {
  ErroreFileTerminale,
  formattaScadenza,
  generaFileTerminale,
  type RigaTerminale,
} from '../src/index.js';

const RIGHE: RigaTerminale[] = [
  { codice: '+banp_1200800p', quantita: 17 },
  { codice: '+ban12008006a', quantita: 172 },
  { codice: 'FILM500', quantita: 2.5 },
];

describe('generaFileTerminale, campi delimitati', () => {
  it('scrive l esempio della documentazione con il formato A,Q', () => {
    expect(generaFileTerminale(RIGHE, { stringaFormato: 'A,Q' })).toBe(
      '+banp_1200800p,17\r\n+ban12008006a,172\r\nFILM500,2.5\r\n',
    );
  });

  it('senza righe produce un file vuoto', () => {
    expect(generaFileTerminale([], { stringaFormato: 'A,Q' })).toBe('');
  });

  it('rispetta l ordine dei campi della stringa formato', () => {
    const righe: RigaTerminale[] = [{ codice: 'FILM500', quantita: 3, lotto: 'L12' }];
    expect(generaFileTerminale(righe, { stringaFormato: 'Q;A;L', fineRiga: '\n' })).toBe(
      '3;FILM500;L12\n',
    );
  });

  it('lascia vuoti lotto, scadenza e campi da ignorare quando mancano', () => {
    const righe: RigaTerminale[] = [{ codice: 'FILM500', quantita: 1 }];
    expect(generaFileTerminale(righe, { stringaFormato: 'A;Q;L;S;X', fineRiga: '\n' })).toBe(
      'FILM500;1;;;\n',
    );
  });

  it('scrive lotto e scadenza in aaaammgg quando ci sono', () => {
    const righe: RigaTerminale[] = [
      { codice: 'FILM500', quantita: 1, lotto: 'LOT-9', scadenza: '2026-12-31' },
    ];
    expect(generaFileTerminale(righe, { stringaFormato: 'A;Q;L;S', fineRiga: '\n' })).toBe(
      'FILM500;1;LOT-9;20261231\n',
    );
  });

  it('scrive al massimo 3 decimali senza zeri finali', () => {
    const righe: RigaTerminale[] = [
      { codice: 'A1', quantita: 2.5 },
      { codice: 'A2', quantita: 2.5001 },
      { codice: 'A3', quantita: 0.125 },
      { codice: 'A4', quantita: 1.1234 },
      { codice: 'A5', quantita: 3.0 },
      { codice: 'A6', quantita: -2.25 },
      { codice: 'A7', quantita: 0 },
    ];
    expect(generaFileTerminale(righe, { stringaFormato: 'A,Q', fineRiga: '\n' })).toBe(
      'A1,2.5\nA2,2.5\nA3,0.125\nA4,1.123\nA5,3\nA6,-2.25\nA7,0\n',
    );
  });

  it('usa il separatore decimale richiesto', () => {
    const righe: RigaTerminale[] = [{ codice: 'FILM500', quantita: 2.5 }];
    expect(
      generaFileTerminale(righe, {
        stringaFormato: 'A;Q',
        separatoreDecimale: ',',
        fineRiga: '\n',
      }),
    ).toBe('FILM500;2,5\n');
  });

  it('usa \\r\\n come fine riga predefinita', () => {
    expect(generaFileTerminale([{ codice: 'A1', quantita: 1 }], { stringaFormato: 'A,Q' })).toBe(
      'A1,1\r\n',
    );
  });

  it('rifiuta il separatore decimale uguale al separatore dei campi', () => {
    expect(() =>
      generaFileTerminale(RIGHE, { stringaFormato: 'A,Q', separatoreDecimale: ',' }),
    ).toThrow(/coincide con il separatore dei campi/);
  });

  it('rifiuta una stringa formato non valida spiegando il motivo', () => {
    expect(() => generaFileTerminale(RIGHE, { stringaFormato: 'A,A' })).toThrow(
      ErroreFileTerminale,
    );
    expect(() => generaFileTerminale(RIGHE, { stringaFormato: 'A,A' })).toThrow(/campo Q/);
  });

  it('rifiuta una riga senza codice o con quantità non valida', () => {
    expect(() =>
      generaFileTerminale([{ codice: '', quantita: 1 }], { stringaFormato: 'A,Q' }),
    ).toThrow(/non ha il codice prodotto/);
    expect(() =>
      generaFileTerminale([{ codice: 'A1', quantita: Number.NaN }], { stringaFormato: 'A,Q' }),
    ).toThrow(/Quantità non valida/);
  });
});

describe('generaFileTerminale, spaziatura fissa', () => {
  it('allinea il codice a sinistra e la quantità a destra con gli zeri', () => {
    const righe: RigaTerminale[] = [
      { codice: 'FILM500', quantita: 2.5 },
      { codice: 'A1', quantita: 172 },
    ];
    expect(generaFileTerminale(righe, { stringaFormato: 'AAAAAAAAQQQqq', fineRiga: '\n' })).toBe(
      'FILM500 00250\nA1      17200\n',
    );
  });

  it('tronca il codice più lungo del campo', () => {
    const righe: RigaTerminale[] = [{ codice: '+banp_1200800p', quantita: 17 }];
    expect(generaFileTerminale(righe, { stringaFormato: 'AAAAQQQ', fineRiga: '\n' })).toBe(
      '+ban017\n',
    );
  });

  it('tronca i decimali che non entrano nel campo q', () => {
    const righe: RigaTerminale[] = [{ codice: 'A1', quantita: 1.567 }];
    expect(generaFileTerminale(righe, { stringaFormato: 'AAQQq', fineRiga: '\n' })).toBe('A1015\n');
  });

  it('scrive il segno meno davanti alla quantità negativa', () => {
    const righe: RigaTerminale[] = [{ codice: 'A1', quantita: -12 }];
    expect(generaFileTerminale(righe, { stringaFormato: 'AAQQQQ', fineRiga: '\n' })).toBe(
      'A1-012\n',
    );
  });

  it('riempie di spazi lotto, scadenza e campi da ignorare', () => {
    const righe: RigaTerminale[] = [
      { codice: 'A1', quantita: 1, lotto: 'LOTTO-LUNGO', scadenza: '2026-01-05' },
      { codice: 'A2', quantita: 2 },
    ];
    expect(
      generaFileTerminale(righe, { stringaFormato: 'AAQXXLLLLSSSSSSSS', fineRiga: '\n' }),
    ).toBe('A11  LOTT20260105\nA22' + ' '.repeat(14) + '\n');
  });

  it('rifiuta una quantità con decimali se manca il campo q', () => {
    expect(() =>
      generaFileTerminale([{ codice: 'A1', quantita: 2.5 }], { stringaFormato: 'AAQQQ' }),
    ).toThrow(/non prevede il campo q/);
  });

  it('rifiuta una quantità che non entra nel campo Q', () => {
    expect(() =>
      generaFileTerminale([{ codice: 'A1', quantita: 1234 }], { stringaFormato: 'AAQQQ' }),
    ).toThrow(/non entra in 3 caratteri/);
  });
});

describe('formattaScadenza', () => {
  it('accetta ISO, aaaammgg e Date', () => {
    expect(formattaScadenza('2026-12-31')).toBe('20261231');
    expect(formattaScadenza('2026-12-31T10:00:00.000Z')).toBe('20261231');
    expect(formattaScadenza('20261231')).toBe('20261231');
    expect(formattaScadenza(new Date('2026-01-05T23:30:00.000Z'))).toBe('20260105');
  });

  it('rifiuta le date non riconoscibili', () => {
    expect(() => formattaScadenza('31/12/2026')).toThrow(/Data di scadenza non valida/);
    expect(() => formattaScadenza(new Date('niente'))).toThrow(/Data di scadenza non valida/);
  });
});
