import { describe, expect, it } from 'vitest';
import { nomeFileDaIntestazione } from '../src/esportazioni/download.js';
import { FILTRO_STATO_DEFAULT, filtraSessioni } from '../src/esportazioni/filtri.js';
import type { SessioneBridge } from '../src/sync/sessioni.js';

function sessioneBridge(id: string, stato: SessioneBridge['stato']): SessioneBridge {
  return {
    id,
    tipo: 'inventario',
    nome: `Sessione ${id}`,
    stato,
    modalita: 'chiedi_quantita',
    creataIl: '2026-09-16T08:00:00.000Z',
    chiusaIl: '2026-09-16T09:00:00.000Z',
    ricevutaIl: '2026-09-16T09:00:01.000Z',
    conteggioRighe: 2,
    sommaQuantita: 5,
  };
}

describe('filtraSessioni', () => {
  it('tiene solo le sessioni con uno stato del filtro', () => {
    const sessioni = [
      sessioneBridge('1', 'chiusa'),
      sessioneBridge('2', 'esportata'),
      sessioneBridge('3', 'importata'),
    ];
    expect(filtraSessioni(sessioni, new Set(['importata']))).toEqual([sessioni[2]]);
    expect(filtraSessioni(sessioni, new Set(['chiusa', 'esportata']))).toEqual([
      sessioni[0],
      sessioni[1],
    ]);
  });

  it('il filtro di default tiene chiuse ed esportate ma non importate', () => {
    const sessioni = [
      sessioneBridge('1', 'chiusa'),
      sessioneBridge('2', 'esportata'),
      sessioneBridge('3', 'importata'),
    ];
    expect(filtraSessioni(sessioni, FILTRO_STATO_DEFAULT).map((s) => s.id)).toEqual(['1', '2']);
  });

  it('con un filtro vuoto non tiene nessuna sessione', () => {
    expect(filtraSessioni([sessioneBridge('1', 'chiusa')], new Set())).toEqual([]);
  });
});

describe('nomeFileDaIntestazione', () => {
  it('legge il nome tra virgolette di Content-Disposition', () => {
    expect(
      nomeFileDaIntestazione(
        'attachment; filename="terminale-inventario-scaffale-a-20260917.txt"',
        'ripiego.txt',
      ),
    ).toBe('terminale-inventario-scaffale-a-20260917.txt');
  });

  it('legge il nome senza virgolette', () => {
    expect(nomeFileDaIntestazione('attachment; filename=file.txt', 'ripiego.txt')).toBe(
      'file.txt',
    );
  });

  it('decodifica la forma filename* con codifica UTF-8', () => {
    expect(
      nomeFileDaIntestazione("attachment; filename*=UTF-8''terminale-caff%C3%A8.txt", 'r.txt'),
    ).toBe('terminale-caffè.txt');
  });

  it('usa il ripiego se manca l’intestazione', () => {
    expect(nomeFileDaIntestazione(undefined, 'ripiego.txt')).toBe('ripiego.txt');
    expect(nomeFileDaIntestazione(null, 'ripiego.txt')).toBe('ripiego.txt');
  });

  it('usa il ripiego se non riconosce il formato', () => {
    expect(nomeFileDaIntestazione('inline', 'ripiego.txt')).toBe('ripiego.txt');
  });
});
