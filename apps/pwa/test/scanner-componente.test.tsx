import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Scanner } from '../src/scanner/Scanner.js';

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

/** Tasti inviati uno dopo l'altro senza pause, come un lettore Bluetooth. */
function raffica(testo: string) {
  for (const tasto of [...testo, 'Enter']) {
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: tasto, bubbles: true, cancelable: true }),
    );
  }
}

describe('componente Scanner', () => {
  it('ascolta il lettore e il campo manuale finché è montato', async () => {
    const onCodice = vi.fn(() => 'trovato' as const);
    await act(async () => {
      radice.render(<Scanner onCodice={onCodice} onChiudi={() => undefined} />);
    });

    // In jsdom non c'è la fotocamera: lo scanner lo dice e resta usabile con le altre sorgenti.
    expect(contenitore.textContent).toContain('https');

    await act(async () => raffica('8001234567890'));
    expect(onCodice).toHaveBeenCalledWith('8001234567890', 'lettore');

    const campo = contenitore.querySelector('input') as HTMLInputElement;
    const imposta = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    await act(async () => {
      imposta?.call(campo, ' SCATOLA-40 ');
      campo.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      (contenitore.querySelector('form') as HTMLFormElement).requestSubmit();
    });
    expect(onCodice).toHaveBeenLastCalledWith('SCATOLA-40', 'manuale');
    expect(campo.value).toBe('');

    act(() => radice.render(<></>));
    await act(async () => raffica('1234567890128'));
    expect(onCodice).toHaveBeenCalledTimes(2);
  });

  it('chiude con il pulsante', async () => {
    const onChiudi = vi.fn();
    await act(async () => {
      radice.render(<Scanner onCodice={() => undefined} onChiudi={onChiudi} />);
    });
    const chiudi = contenitore.querySelector('[aria-label="Chiudi scanner"]') as HTMLButtonElement;
    act(() => chiudi.click());
    expect(onChiudi).toHaveBeenCalledOnce();
  });
});
