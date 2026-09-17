import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db.js';
import { Sessione } from '../src/pagine/Sessione.js';
import { creaSessione } from '../src/sessioni/operazioni.js';
import { barcode, prodotto } from './aiuti.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let contenitore: HTMLDivElement;
let radice: Root;
let percorso = '';

function Posizione() {
  percorso = useLocation().pathname + useLocation().search;
  return null;
}

beforeEach(async () => {
  await Promise.all(db.tables.map((tabella) => tabella.clear()));
  await db.prodotti.bulkPut([
    prodotto('A1', 'Scatola 40x30', { giacenza: 10 }),
    prodotto('B2', 'Nastro adesivo'),
  ]);
  await db.barcode.bulkPut([barcode('8001', 'A1'), barcode('8002', 'B2')]);
  contenitore = document.createElement('div');
  document.body.appendChild(contenitore);
  radice = createRoot(contenitore);
});

afterEach(() => {
  act(() => radice.unmount());
  contenitore.remove();
});

async function apri(id: string) {
  await act(async () => {
    radice.render(
      <MemoryRouter initialEntries={[`/sessioni/${id}`]}>
        <Posizione />
        <Routes>
          <Route path="/sessioni/:id" element={<Sessione />} />
          <Route path="*" element={<p>altrove</p>} />
        </Routes>
      </MemoryRouter>,
    );
  });
}

/** Aspetta che le query di Dexie arrivino all'interfaccia. */
async function attendi(condizione: () => boolean | Promise<boolean>, descrizione: string) {
  for (let i = 0; i < 100; i++) {
    if (await condizione()) return;
    await act(async () => new Promise((fine) => setTimeout(fine, 10)));
  }
  throw new Error(`Timeout: ${descrizione}`);
}

function raffica(testo: string) {
  for (const tasto of [...testo, 'Enter']) {
    (document.activeElement ?? document).dispatchEvent(
      new KeyboardEvent('keydown', { key: tasto, bubbles: true, cancelable: true }),
    );
  }
}

const trova = <T extends Element>(selettore: string) =>
  contenitore.querySelector<T>(selettore) ?? document.querySelector<T>(selettore);

async function clic(selettore: string) {
  const elemento = trova<HTMLElement>(selettore);
  if (!elemento) throw new Error(`Non trovato: ${selettore}`);
  await act(async () => elemento.click());
}

async function digita(tasti: string) {
  for (const tasto of tasti)
    await clic(`button[aria-label="${tasto === '<' ? 'Cancella una cifra' : tasto}"]`);
}

function pulsante(testo: string): HTMLButtonElement {
  const trovato = [...contenitore.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === testo,
  );
  if (!trovato) throw new Error(`Pulsante non trovato: ${testo}`);
  return trovato;
}

const righe = () => db.righe.toArray().then((tutte) => tutte.sort((a, b) => a.ordine - b.ordine));

describe('schermata sessione', () => {
  it('chiedi quantità: aggiunge con lettore e tastierino, modifica, avvisa sullo zero, cancella', async () => {
    const sessione = await creaSessione(db, {
      tipo: 'inventario',
      nome: 'Scaffale A',
      modalita: 'chiedi_quantita',
    });
    await apri(sessione.id);
    await attendi(() => trova('[aria-label="Esci dalla sessione"]') !== null, 'scanner montato');

    // Lettura dal lettore Bluetooth: si apre il foglio con descrizione e giacenza teorica.
    await act(async () => raffica('8001'));
    await attendi(() => trova('input[inputmode="none"]') !== null, 'foglio quantità');
    const foglio = contenitore.querySelector('[role="dialog"][aria-labelledby]');
    expect(foglio?.textContent).toContain('Scatola 40x30');
    expect(foglio?.textContent).toContain('Giacenza teorica');
    const campo = trova<HTMLInputElement>('input[inputmode="none"]')!;
    expect(document.activeElement).toBe(campo);

    // Una seconda lettura con il foglio aperto non passa.
    await act(async () => raffica('8002'));
    expect(contenitore.textContent).toContain('Prima conferma o annulla');

    await digita('12,5');
    expect(campo.value).toBe('12,5');
    // Invio dalla tastiera sul campo che ha il fuoco conferma, senza toccare lo schermo.
    await act(async () => {
      campo.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    await attendi(() => trova('input[inputmode="none"]') === null, 'foglio chiuso');
    expect(await righe()).toMatchObject([
      { codiceProdotto: 'A1', quantita: 12.5, barcodeLetto: '8001' },
    ]);
    await attendi(() => contenitore.textContent?.includes('Ultima riga') ?? false, 'ultima riga');

    // Modifica: la quantità attuale è precompilata.
    await clic('[aria-label="Modifica quantità di A1"]');
    const modifica = trova<HTMLInputElement>('input[inputmode="none"]')!;
    expect(modifica.value).toBe('12,5');
    await digita('<<<<');
    await digita('0');
    await act(async () => pulsante('Salva').click());
    // Zero: avviso e nessun salvataggio al primo tentativo.
    expect(contenitore.textContent).toContain('Quantità zero');
    expect((await righe())[0]?.quantita).toBe(12.5);
    await digita('<');
    await digita('7');
    await act(async () => pulsante('Salva').click());
    await attendi(() => trova('input[inputmode="none"]') === null, 'modifica salvata');
    expect((await righe())[0]?.quantita).toBe(7);

    // Cancellazione con conferma: "Annulla" non tocca nulla, "Cancella riga" sì.
    await clic('[aria-label="Cancella riga di A1"]');
    expect(trova('[role="alertdialog"]')?.textContent).toContain('Cancellare la riga?');
    await act(async () => pulsante('Annulla').click());
    expect(await righe()).toHaveLength(1);
    await clic('[aria-label="Cancella riga di A1"]');
    await act(async () => pulsante('Cancella riga').click());
    await attendi(
      () => !(contenitore.textContent?.includes('Ultima riga') ?? true),
      'riga cancellata',
    );
    expect(await righe()).toHaveLength(0);
  });

  it('somma uno: ogni lettura aggiunge 1 e mostra il totale del prodotto', async () => {
    const sessione = await creaSessione(db, {
      tipo: 'carico',
      nome: 'Arrivo',
      modalita: 'somma_uno',
    });
    await apri(sessione.id);
    await attendi(() => trova('[aria-label="Esci dalla sessione"]') !== null, 'scanner montato');

    for (const [i, codice] of ['8001', '8002', '8001'].entries()) {
      await act(async () => raffica(codice));
      // Lo scanner scarta le letture mentre la precedente è ancora in lavorazione.
      await attendi(async () => (await db.righe.count()) === i + 1, `lettura ${i + 1}`);
    }
    await attendi(
      () =>
        contenitore
          .querySelector('[aria-label="Ultima riga inserita"]')
          ?.textContent?.includes('Totale prodotto: 2') ?? false,
      'totale 2',
    );
    expect((await righe()).map((r) => [r.codiceProdotto, r.quantita])).toEqual([
      ['A1', 1],
      ['B2', 1],
      ['A1', 1],
    ]);
    expect(trova('input[inputmode="none"]')).toBeNull();
  });

  it('codice sconosciuto dal lettore porta all’abbinamento legato alla sessione', async () => {
    const sessione = await creaSessione(db, {
      tipo: 'ddt',
      nome: 'Cliente',
      modalita: 'chiedi_quantita',
      cliente: { nome: 'Rossi srl' },
    });
    await apri(sessione.id);
    await attendi(() => trova('[aria-label="Esci dalla sessione"]') !== null, 'scanner montato');
    await act(async () => raffica('999999'));
    await attendi(() => percorso.startsWith('/consulta/abbina/'), 'navigazione');
    expect(percorso).toBe(`/consulta/abbina/999999?sessione=${sessione.id}`);
  });

  it('riepilogo e chiusura: la sessione passa a chiusa e va in coda', async () => {
    const sessione = await creaSessione(db, {
      tipo: 'inventario',
      nome: 'Scaffale B',
      modalita: 'somma_uno',
    });
    await apri(sessione.id);
    await attendi(() => trova('[aria-label="Esci dalla sessione"]') !== null, 'scanner montato');
    await act(async () => raffica('8001'));
    await attendi(() => contenitore.textContent?.includes('Ultima riga') ?? false, 'riga');

    await act(async () => pulsante('Riepilogo e chiusura').click());
    await attendi(
      () => contenitore.textContent?.includes('prodotto diverso') ?? false,
      'riepilogo',
    );
    await act(async () => pulsante('Chiudi e invia').click());
    await attendi(
      () => contenitore.textContent?.includes('Riapri sessione') ?? false,
      'sessione chiusa',
    );
    expect((await db.sessioni.get(sessione.id))?.stato).toBe('chiusa');
    expect(await db.codaUpload.toArray()).toMatchObject([
      { tipo: 'sessione', riferimento: sessione.id },
    ]);
  });
});
