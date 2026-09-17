import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FoglioQuantita } from '../src/componenti/FoglioQuantita.js';

// Rende `act` affidabile fuori da una libreria di test.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let contenitore: HTMLDivElement;
let radice: Root;

beforeEach(() => {
  contenitore = document.createElement('div');
  document.body.appendChild(contenitore);
  radice = createRoot(contenitore);
});

afterEach(() => {
  act(() => radice.unmount());
  contenitore.remove();
});

function pulsante(testo: string): HTMLButtonElement {
  const trovato = [...contenitore.querySelectorAll('button')].find(
    (candidato) => candidato.textContent?.trim() === testo,
  );
  if (!trovato) throw new Error(`Pulsante "${testo}" non trovato`);
  return trovato;
}

describe('FoglioQuantita', () => {
  it('salva una volta sola anche con due tocchi su Aggiungi, con i tasti bloccati nel frattempo', async () => {
    let sblocca = () => {};
    const onConferma = vi.fn(
      () =>
        new Promise<void>((risolvi) => {
          sblocca = risolvi;
        }),
    );
    await act(async () => {
      radice.render(
        <FoglioQuantita
          titolo="Quantità"
          codice="A1"
          valoreIniziale="3"
          etichettaConferma="Aggiungi"
          onConferma={onConferma}
          onAnnulla={() => undefined}
        />,
      );
    });

    await act(async () => {
      pulsante('Aggiungi').click();
    });
    // Il telefono è lento e l'utente ritocca: il pulsante è già bloccato.
    await act(async () => {
      pulsante('Salvataggio…').click();
    });
    expect(onConferma).toHaveBeenCalledTimes(1);
    expect(onConferma).toHaveBeenCalledWith(3);
    expect(pulsante('Salvataggio…').disabled).toBe(true);
    expect(pulsante('Annulla').disabled).toBe(true);
    expect(pulsante('7').disabled).toBe(true);

    await act(async () => {
      sblocca();
    });
    expect(pulsante('Aggiungi').disabled).toBe(false);
  });
});
