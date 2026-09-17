import { describe, expect, it } from 'vitest';
import { transizioneStato, TRANSIZIONI_AMMESSE } from '../src/index.js';

describe('transizioneStato', () => {
  it('ammette il ciclo normale aperta → chiusa → esportata → importata', () => {
    expect(transizioneStato('aperta', 'chiusa')).toBe(true);
    expect(transizioneStato('chiusa', 'esportata')).toBe(true);
    expect(transizioneStato('esportata', 'importata')).toBe(true);
  });

  it('ammette la riapertura di una sessione chiusa', () => {
    expect(transizioneStato('chiusa', 'aperta')).toBe(true);
  });

  it('ammette di riportare a chiusa una sessione esportata, per rifare l export', () => {
    expect(transizioneStato('esportata', 'chiusa')).toBe(true);
  });

  it('vieta di riaprire una sessione già esportata o importata', () => {
    expect(transizioneStato('esportata', 'aperta')).toBe(false);
    expect(transizioneStato('importata', 'aperta')).toBe(false);
    expect(transizioneStato('importata', 'esportata')).toBe(false);
  });

  it('vieta i salti di stato e le transizioni verso lo stesso stato', () => {
    expect(transizioneStato('aperta', 'esportata')).toBe(false);
    expect(transizioneStato('aperta', 'importata')).toBe(false);
    expect(transizioneStato('chiusa', 'importata')).toBe(false);
    expect(transizioneStato('chiusa', 'chiusa')).toBe(false);
  });

  it('da importata non si va da nessuna parte', () => {
    expect(TRANSIZIONI_AMMESSE.importata).toEqual([]);
  });
});
