import { describe, expect, it } from 'vitest';
import {
  cercaClienti,
  clienteDocumento,
  costruisciIndiceClienti,
  type Cliente,
} from '../src/index.js';

function cliente(id: string, nome: string, extra: Partial<Cliente> = {}): Cliente {
  return {
    id,
    codice: id,
    nome,
    origine: 'easyfatt',
    aggiornatoIl: '2026-09-17T10:00:00.000Z',
    ...extra,
  };
}

const clienti = [
  cliente('0018', 'Ceramiche Italiane srl', { partitaIva: '03322350178' }),
  cliente('0020', 'Brunelli Imballaggi', { partitaIva: '01234567890' }),
  cliente('0180', 'Cartotecnica Àlfa', { partitaIva: 'DE123456789' }),
  cliente('0099', 'Vecchio cliente', { eliminatoIl: '2026-09-01T00:00:00.000Z' }),
  {
    id: 'b1f0c1a2-0000-4000-8000-000000000001',
    nome: 'Nuovo cliente del telefono',
    origine: 'app',
    partitaIva: '09876543210',
    aggiornatoIl: '2026-09-17T11:00:00.000Z',
  } satisfies Cliente,
];
const indice = costruisciIndiceClienti(clienti);
const nomi = (risultati: Cliente[]) => risultati.map((c) => c.nome);

describe('costruisciIndiceClienti', () => {
  it('esclude i clienti eliminati', () => {
    expect(indice.voci).toHaveLength(4);
    expect(nomi(cercaClienti(indice, 'vecchio', 30))).toEqual([]);
  });
});

describe('cercaClienti', () => {
  it('trova per nome senza badare a maiuscole e accenti', () => {
    expect(nomi(cercaClienti(indice, 'CARTOTECNICA alfa', 30))).toEqual(['Cartotecnica Àlfa']);
  });

  it('cerca i token in AND', () => {
    expect(nomi(cercaClienti(indice, 'ceramiche srl', 30))).toEqual(['Ceramiche Italiane srl']);
    expect(nomi(cercaClienti(indice, 'ceramiche brunelli', 30))).toEqual([]);
  });

  it('trova per codice, con il codice identico prima dei prefissi', () => {
    expect(nomi(cercaClienti(indice, '0018', 30))).toEqual(['Ceramiche Italiane srl']);
    expect(nomi(cercaClienti(indice, '001', 30))).toEqual(['Ceramiche Italiane srl']);
    // "018" è dentro "0018" e "0180": prima il prefisso di codice, poi il resto.
    expect(nomi(cercaClienti(indice, '018', 30))).toEqual([
      'Cartotecnica Àlfa',
      'Ceramiche Italiane srl',
    ]);
  });

  it('trova per partita IVA, anche estera e per clienti creati in app', () => {
    expect(nomi(cercaClienti(indice, '03322350178', 30))).toEqual(['Ceramiche Italiane srl']);
    expect(nomi(cercaClienti(indice, 'de1234', 30))).toEqual(['Cartotecnica Àlfa']);
    expect(nomi(cercaClienti(indice, '0987', 30))).toEqual(['Nuovo cliente del telefono']);
  });

  it('mette prima i nomi che iniziano con la query, poi in ordine alfabetico', () => {
    const indiceNomi = costruisciIndiceClienti([
      cliente('1', 'Zeta imballaggi'),
      cliente('2', 'Alfa imballaggi'),
      cliente('3', 'Imballaggi Rossi'),
      cliente('4', 'Imballaggi Bianchi'),
      cliente('5', 'Carta e imballaggi di Neri'),
    ]);
    expect(nomi(cercaClienti(indiceNomi, 'imballaggi', 30))).toEqual([
      'Imballaggi Bianchi',
      'Imballaggi Rossi',
      'Alfa imballaggi',
      'Carta e imballaggi di Neri',
      'Zeta imballaggi',
    ]);
    expect(nomi(cercaClienti(indiceNomi, 'imballaggi rossi', 30))).toEqual(['Imballaggi Rossi']);
    expect(nomi(cercaClienti(indiceNomi, 'rossi imballaggi', 30))).toEqual(['Imballaggi Rossi']);
  });

  it('rispetta il limite e non cerca con query vuota o limite nullo', () => {
    const molti = costruisciIndiceClienti(
      Array.from({ length: 50 }, (_, i) => cliente(String(i), `Cliente ${i}`)),
    );
    expect(cercaClienti(molti, 'cliente', 30)).toHaveLength(30);
    expect(cercaClienti(molti, '   ', 30)).toEqual([]);
    expect(cercaClienti(molti, 'cliente', 0)).toEqual([]);
  });
});

describe('clienteDocumento', () => {
  it('tiene solo i campi del documento', () => {
    const completo: Cliente = {
      ...cliente('0018', 'Ceramiche Italiane srl', { partitaIva: '03322350178', citta: 'Brescia' }),
      listino: 2,
      eliminatoIl: '2026-09-18T00:00:00.000Z',
    };
    expect(clienteDocumento(completo)).toEqual({
      codice: '0018',
      nome: 'Ceramiche Italiane srl',
      partitaIva: '03322350178',
      citta: 'Brescia',
    });
  });

  it("per un cliente di Easyfatt senza codice usa l'id; per uno creato in app no", () => {
    const senzaCodice: Cliente = {
      id: '0018',
      nome: 'Ceramiche',
      origine: 'easyfatt',
      aggiornatoIl: 'x',
    };
    expect(clienteDocumento(senzaCodice)).toEqual({ codice: '0018', nome: 'Ceramiche' });
    expect(
      clienteDocumento({ id: 'uuid', nome: 'Nuovo', origine: 'app', aggiornatoIl: 'x' }),
    ).toEqual({ nome: 'Nuovo' });
  });
});
