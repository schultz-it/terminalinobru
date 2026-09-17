import { describe, expect, it } from 'vitest';
import {
  IMPOSTAZIONI_DEFAULT,
  schemaCliente,
  schemaClienteDocumento,
  schemaSessione,
  validaCliente,
} from '../src/index.js';

const COMPLETO = {
  codice: 'C001',
  nome: 'Rossi Imballaggi S.r.l.',
  partitaIva: '01234567890',
  codiceFiscale: 'RSSMRA80A01H501U',
  indirizzo: 'Via Roma 1',
  cap: '47121',
  citta: 'Forlì',
  provincia: 'FC',
  nazione: 'Italia',
  sdi: 'M5UXCR1',
  telefono: '0543 123456',
  email: 'ordini@rossi.it',
};

describe('schemaClienteDocumento', () => {
  it('accetta un cliente completo e uno con il solo nome', () => {
    expect(schemaClienteDocumento.parse(COMPLETO)).toEqual(COMPLETO);
    expect(schemaClienteDocumento.parse({ nome: 'Bianchi' })).toEqual({ nome: 'Bianchi' });
  });

  it('accetta una partita IVA estera con la sigla del paese, anche minuscola', () => {
    expect(
      schemaClienteDocumento.safeParse({ nome: 'GmbH', partitaIva: 'DE123456789' }).success,
    ).toBe(true);
    const esito = validaCliente({ nome: 'GmbH', partitaIva: 'de123456789' });
    expect(esito).toEqual({ valido: true, cliente: { nome: 'GmbH', partitaIva: 'DE123456789' } });
  });

  it('accetta codice fiscale numerico e PEC al posto del codice destinatario', () => {
    const esito = schemaClienteDocumento.safeParse({
      nome: 'Bianchi',
      codiceFiscale: '01234567890',
      sdi: 'bianchi@pec.it',
    });
    expect(esito.success).toBe(true);
  });

  it.each([
    ['partitaIva', '1234567890'],
    ['partitaIva', '1T01234567890'],
    ['partitaIva', 'D'],
    ['codiceFiscale', 'RSSMRA80A01H501'],
    ['provincia', 'FOR'],
    ['provincia', 'F1'],
    ['sdi', '123456'],
    ['sdi', 'pec@senza-dominio'],
    ['email', 'ordini.rossi.it'],
    ['codice', ''],
  ])('rifiuta %s = %s', (campo, valore) => {
    expect(schemaClienteDocumento.safeParse({ nome: 'Bianchi', [campo]: valore }).success).toBe(
      false,
    );
  });
});

describe('schemaCliente e schemaSessione', () => {
  it('un cliente dall export ha id, origine e listino', () => {
    const cliente = schemaCliente.parse({
      ...COMPLETO,
      id: 'C001',
      origine: 'easyfatt',
      listino: 2,
      aggiornatoIl: '2026-09-17T10:00:00.000Z',
    });
    expect(cliente.listino).toBe(2);
    expect(
      schemaCliente.safeParse({ ...cliente, listino: 10 }).success ||
        schemaCliente.safeParse({ ...cliente, origine: 'shopify' }).success,
    ).toBe(false);
  });

  it('una sessione DDT porta il cliente e il numero documento', () => {
    const base = {
      id: 'sess-1',
      tipo: 'ddt',
      nome: 'Rossi',
      creataIl: '2026-09-17T10:00:00.000Z',
      cliente: { nome: 'Rossi', partitaIva: '01234567890' },
    };
    const s = schemaSessione.parse({ ...base, numeroDocumento: 12 });
    expect(s.cliente?.partitaIva).toBe('01234567890');
    expect(s.numeroDocumento).toBe(12);
    expect(schemaSessione.safeParse({ ...base, numeroDocumento: 0 }).success).toBe(false);
    expect(schemaSessione.safeParse({ ...base, cliente: { nome: '' } }).success).toBe(false);
  });

  it('le impostazioni di default non cambiano', () => {
    expect(Object.keys(IMPOSTAZIONI_DEFAULT)).not.toContain('cliente');
  });
});

describe('validaCliente', () => {
  it('pulisce spazi, campi vuoti e maiuscole', () => {
    expect(
      validaCliente({
        nome: '  Verdi snc ',
        partitaIva: ' 01234567890 ',
        codiceFiscale: 'rssmra80a01h501u',
        provincia: 'fc',
        sdi: 'm5uxcr1',
        email: '',
        telefono: '   ',
      }),
    ).toEqual({
      valido: true,
      cliente: {
        nome: 'Verdi snc',
        partitaIva: '01234567890',
        codiceFiscale: 'RSSMRA80A01H501U',
        provincia: 'FC',
        sdi: 'M5UXCR1',
      },
    });
  });

  it('lascia la PEC in minuscolo', () => {
    const esito = validaCliente({ nome: 'Verdi', sdi: 'Verdi@Pec.it' });
    expect(esito).toEqual({ valido: true, cliente: { nome: 'Verdi', sdi: 'Verdi@Pec.it' } });
  });

  it('restituisce un messaggio in italiano per ogni campo errato', () => {
    expect(
      validaCliente({
        nome: ' ',
        partitaIva: '123',
        codiceFiscale: 'ABC',
        provincia: 'Forlì',
        sdi: '12',
        email: 'nessuna',
      }),
    ).toEqual({
      valido: false,
      errori: {
        nome: 'La ragione sociale è obbligatoria.',
        partitaIva:
          'La partita IVA deve avere 11 cifre, oppure la sigla del paese seguita dal numero (es. DE123456789).',
        codiceFiscale: 'Il codice fiscale deve avere 16 caratteri oppure 11 cifre.',
        provincia: 'La provincia deve essere di 2 lettere.',
        sdi: 'Il codice destinatario deve avere 7 caratteri, oppure indicare una PEC.',
        email: "L'email non è valida.",
      },
    });
  });
});
