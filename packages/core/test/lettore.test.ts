import { describe, expect, it } from 'vitest';
import { rilevaInputLettore, type EventoTasto } from '../src/index.js';

/** Costruisce gli eventi di una sequenza di tasti con un passo costante fra le pressioni. */
function raffica(codice: string, passoMs: number, inizio = 1000): EventoTasto[] {
  const eventi: EventoTasto[] = [];
  let istante = inizio;
  for (const tasto of codice) {
    eventi.push({ tasto, istante });
    istante += passoMs;
  }
  return eventi;
}

/** Aggiunge l'Invio dopo l'ultimo tasto, con il ritardo indicato. */
function conInvio(eventi: EventoTasto[], ritardoMs: number, tasto = 'Enter'): EventoTasto[] {
  const ultimo = eventi[eventi.length - 1];
  const istante = (ultimo?.istante ?? 0) + ritardoMs;
  return [...eventi, { tasto, istante }];
}

describe('rilevaInputLettore', () => {
  it('riconosce una raffica veloce terminata da Invio', () => {
    const eventi = conInvio(raffica('8001234567890', 8), 8);
    expect(rilevaInputLettore(eventi)).toBe('8001234567890');
  });

  it('accetta anche il ritorno a capo grezzo come fine raffica', () => {
    const eventi = conInvio(raffica('FILM500', 5), 5, '\n');
    expect(rilevaInputLettore(eventi)).toBe('FILM500');
  });

  it('riconosce i codici con simboli', () => {
    const eventi = conInvio(raffica('+banp_1200800p', 6), 6);
    expect(rilevaInputLettore(eventi)).toBe('+banp_1200800p');
  });

  it('ignora la digitazione umana, troppo lenta', () => {
    const eventi = conInvio(raffica('8001234567890', 120), 120);
    expect(rilevaInputLettore(eventi)).toBeNull();
  });

  it('ignora una raffica veloce con Invio premuto a mano dopo una pausa', () => {
    const eventi = conInvio(raffica('8001234', 8), 4000);
    expect(rilevaInputLettore(eventi)).toBeNull();
  });

  it('senza Invio non restituisce nulla', () => {
    expect(rilevaInputLettore(raffica('8001234567890', 8))).toBeNull();
  });

  it('su elenco vuoto o solo Invio restituisce null', () => {
    expect(rilevaInputLettore([])).toBeNull();
    expect(rilevaInputLettore([{ tasto: 'Enter', istante: 10 }])).toBeNull();
  });

  it('scarta i codici troppo corti', () => {
    const eventi = conInvio(raffica('AB', 5), 5);
    expect(rilevaInputLettore(eventi)).toBeNull();
    expect(rilevaInputLettore(eventi, { lunghezzaMinima: 2 })).toBe('AB');
  });

  it('non conta i modificatori del lettore come interruzioni', () => {
    const eventi: EventoTasto[] = [
      { tasto: 'Shift', istante: 1000 },
      { tasto: 'A', istante: 1004 },
      { tasto: 'CapsLock', istante: 1006 },
      { tasto: 'B', istante: 1010 },
      { tasto: 'C', istante: 1016 },
      { tasto: 'Enter', istante: 1020 },
    ];
    expect(rilevaInputLettore(eventi)).toBe('ABC');
  });

  it('un tasto speciale in mezzo azzera la raffica', () => {
    const eventi: EventoTasto[] = [
      { tasto: '1', istante: 1000 },
      { tasto: '2', istante: 1006 },
      { tasto: 'Backspace', istante: 1012 },
      ...conInvio(raffica('FILM500', 6, 1018), 6),
    ];
    expect(rilevaInputLettore(eventi)).toBe('FILM500');
  });

  it('dopo una pausa ricomincia a contare dal tasto nuovo', () => {
    const eventi: EventoTasto[] = [
      ...raffica('XY', 5),
      ...conInvio(raffica('FILM500', 6, 3000), 6),
    ];
    expect(rilevaInputLettore(eventi)).toBe('FILM500');
  });

  it('riconosce la prima raffica valida quando ce ne sono due', () => {
    const eventi: EventoTasto[] = [
      ...conInvio(raffica('FILM500', 6), 6),
      ...conInvio(raffica('SCAT-30', 6, 3000), 6),
    ];
    expect(rilevaInputLettore(eventi)).toBe('FILM500');
  });

  it('accetta una soglia personalizzata', () => {
    const eventi = conInvio(raffica('8001234', 80), 80);
    expect(rilevaInputLettore(eventi)).toBeNull();
    expect(rilevaInputLettore(eventi, { sogliaMs: 100 })).toBe('8001234');
  });
});
