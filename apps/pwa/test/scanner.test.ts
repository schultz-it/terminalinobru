import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseTerminalino } from '../src/db.js';
import { analizzaTestoSetup } from '../src/impostazioni.js';
import { creaAntiRimbalzo, INTERVALLO_ANTI_RIMBALZO_MS } from '../src/scanner/antiRimbalzo.js';
import {
  descriviErroreFotocamera,
  fotocameraSuccessiva,
  vincoliVideo,
} from '../src/scanner/fotocamera.js';
import { ascoltaLettoreTastiera, rimuoviDalCampo } from '../src/scanner/lettoreTastiera.js';
import { FORMATI_BARCODE, scegliFormatiNativi } from '../src/scanner/rilevatore.js';
import { abbinaBarcode, risolviCodice } from '../src/scanner/risolvi.js';
import { barcode, nuovoDb, prodotto } from './aiuti.js';

describe('anti-rimbalzo della fotocamera', () => {
  it('non riemette lo stesso codice per 1,5 s', () => {
    const emetti = creaAntiRimbalzo();
    expect(INTERVALLO_ANTI_RIMBALZO_MS).toBe(1500);
    expect(emetti('8001234567890', 0)).toBe(true);
    expect(emetti('8001234567890', 100)).toBe(false);
    expect(emetti('8001234567890', 1499)).toBe(false);
    expect(emetti('8001234567890', 1500)).toBe(true);
  });

  it('lascia passare subito un codice diverso', () => {
    const emetti = creaAntiRimbalzo();
    expect(emetti('A', 0)).toBe(true);
    expect(emetti('B', 10)).toBe(true);
    // Il ritorno ad A è un'emissione nuova, non un rimbalzo.
    expect(emetti('A', 20)).toBe(true);
    expect(emetti('A', 30)).toBe(false);
  });

  it("conta l'intervallo dall'ultima emissione", () => {
    const emetti = creaAntiRimbalzo(1000);
    expect(emetti('A', 0)).toBe(true);
    expect(emetti('A', 900)).toBe(false);
    expect(emetti('A', 1000)).toBe(true);
    expect(emetti('A', 1900)).toBe(false);
    expect(emetti('A', 2000)).toBe(true);
  });
});

/** Orologio manuale e funzione che simula tasti con un intervallo fra l'uno e l'altro. */
function tastiera(bersaglio: EventTarget = document) {
  let istante = 1000;
  const adesso = () => istante;
  function premi(tasti: string[], intervalloMs: number, opzioni: KeyboardEventInit = {}) {
    const eventi: KeyboardEvent[] = [];
    for (const tasto of tasti) {
      istante += intervalloMs;
      const evento = new KeyboardEvent('keydown', {
        key: tasto,
        bubbles: true,
        cancelable: true,
        ...opzioni,
      });
      bersaglio.dispatchEvent(evento);
      eventi.push(evento);
    }
    return eventi;
  }
  const scrivi = (testo: string, intervalloMs: number) => premi([...testo, 'Enter'], intervalloMs);
  return { adesso, premi, scrivi, attendi: (ms: number) => (istante += ms) };
}

describe('lettore in modalità tastiera', () => {
  let smetti: (() => void) | undefined;
  afterEach(() => {
    smetti?.();
    smetti = undefined;
    document.body.innerHTML = '';
  });

  it('riconosce la raffica di un lettore Bluetooth simulato', () => {
    const letti: string[] = [];
    const { adesso, scrivi } = tastiera();
    smetti = ascoltaLettoreTastiera(document, (c) => letti.push(c), { adesso });
    const eventi = scrivi('8001234567890', 8);
    expect(letti).toEqual(['8001234567890']);
    expect(eventi.at(-1)?.defaultPrevented).toBe(true);
  });

  it('ignora la digitazione umana e non blocca il suo Invio', () => {
    const letti: string[] = [];
    const { adesso, scrivi } = tastiera();
    smetti = ascoltaLettoreTastiera(document, (c) => letti.push(c), { adesso });
    const eventi = scrivi('8001234567890', 180);
    expect(letti).toEqual([]);
    expect(eventi.some((e) => e.defaultPrevented)).toBe(false);
  });

  it('separa la raffica dai tasti digitati a mano poco prima', () => {
    const letti: string[] = [];
    const { adesso, premi, scrivi, attendi } = tastiera();
    smetti = ascoltaLettoreTastiera(document, (c) => letti.push(c), { adesso });
    premi(['s', 'c', 'a'], 200);
    attendi(300);
    scrivi('ABC-123', 5);
    expect(letti).toEqual(['ABC-123']);
  });

  it('legge due codici di seguito e accetta i caratteri con Shift', () => {
    const letti: string[] = [];
    const { adesso, premi } = tastiera();
    smetti = ascoltaLettoreTastiera(document, (c) => letti.push(c), { adesso });
    premi(['Shift', 'A', '1', '2', 'Enter'], 4);
    premi(['9', '9', '9', 'Enter'], 4);
    expect(letti).toEqual(['A12', '999']);
  });

  it('non scambia per lettore un tasto tenuto premuto o una scorciatoia', () => {
    const letti: string[] = [];
    const { adesso, premi } = tastiera();
    smetti = ascoltaLettoreTastiera(document, (c) => letti.push(c), { adesso });
    premi(['a', 'a', 'a', 'a'], 30, { repeat: true });
    premi(['Enter'], 30);
    premi(['v'], 5, { ctrlKey: true });
    premi(['Enter'], 5);
    expect(letti).toEqual([]);
  });

  it('se il lettore scrive in un campo, toglie i caratteri e ferma l’Invio', () => {
    document.body.innerHTML = '<form><input id="campo" /></form>';
    const campo = document.getElementById('campo') as HTMLInputElement;
    const form = campo.form as HTMLFormElement;
    const invio = vi.fn((e: Event) => e.preventDefault());
    form.addEventListener('submit', invio);
    const letti: string[] = [];
    const modifiche: string[] = [];
    campo.addEventListener('input', () => modifiche.push(campo.value));
    const { adesso, premi } = tastiera(campo);
    smetti = ascoltaLettoreTastiera(document, (c) => letti.push(c), { adesso });

    // L'utente ha scritto "vite" a mano; jsdom non inserisce i caratteri, li simuliamo.
    campo.value = 'vite';
    campo.focus();
    const tasti = [...'8001234567890'];
    for (const tasto of tasti) {
      campo.value += tasto;
      premi([tasto], 6);
    }
    const [enter] = premi(['Enter'], 6);

    expect(letti).toEqual(['8001234567890']);
    expect(enter?.defaultPrevented).toBe(true);
    expect(campo.value).toBe('vite');
    expect(modifiche).toEqual(['vite']);
    expect(invio).not.toHaveBeenCalled();
  });

  it('smette di ascoltare dopo la funzione di rilascio', () => {
    const letti: string[] = [];
    const { adesso, scrivi } = tastiera();
    const rilascia = ascoltaLettoreTastiera(document, (c) => letti.push(c), { adesso });
    rilascia();
    scrivi('8001234567890', 5);
    expect(letti).toEqual([]);
  });

  it('rimuoviDalCampo non tocca un campo che non termina con il codice', () => {
    document.body.innerHTML = '<textarea id="t"></textarea>';
    const area = document.getElementById('t') as HTMLTextAreaElement;
    area.value = 'nota libera';
    rimuoviDalCampo(area, '123');
    expect(area.value).toBe('nota libera');
    area.value = 'nota 123';
    rimuoviDalCampo(area, '123');
    expect(area.value).toBe('nota ');
    rimuoviDalCampo(document.body, '123');
    rimuoviDalCampo(null, '123');
  });
});

describe('fotocamera e rilevatore', () => {
  it('usa il BarcodeDetector nativo solo se legge almeno EAN-13', () => {
    expect(scegliFormatiNativi(['qr_code', 'ean_13', 'aztec', 'ean_8'])).toEqual([
      'ean_13',
      'ean_8',
      'qr_code',
    ]);
    expect(scegliFormatiNativi([])).toBeNull();
    expect(scegliFormatiNativi(['qr_code'])).toBeNull();
    expect(scegliFormatiNativi([...FORMATI_BARCODE, 'pdf417'])).toEqual([...FORMATI_BARCODE]);
  });

  it('chiede la fotocamera posteriore o quella scelta', () => {
    expect(vincoliVideo(undefined).video).toMatchObject({ facingMode: { ideal: 'environment' } });
    expect(vincoliVideo('abc').video).toMatchObject({ deviceId: { exact: 'abc' } });
    expect(vincoliVideo(undefined).audio).toBe(false);
  });

  it('passa alla fotocamera successiva in giro', () => {
    expect(fotocameraSuccessiva([], undefined)).toBeUndefined();
    expect(fotocameraSuccessiva(['a', 'b', 'c'], undefined)).toBe('a');
    expect(fotocameraSuccessiva(['a', 'b', 'c'], 'b')).toBe('c');
    expect(fotocameraSuccessiva(['a', 'b', 'c'], 'c')).toBe('a');
    expect(fotocameraSuccessiva(['a', 'b'], 'sparita')).toBe('a');
  });

  it('traduce gli errori di getUserMedia', () => {
    expect(descriviErroreFotocamera(new DOMException('no', 'NotAllowedError')).tipo).toBe('negato');
    expect(descriviErroreFotocamera(new DOMException('no', 'NotFoundError')).tipo).toBe('assente');
    expect(descriviErroreFotocamera(new DOMException('no', 'NotReadableError')).tipo).toBe(
      'occupata',
    );
    expect(descriviErroreFotocamera(new TypeError('x')).tipo).toBe('non-supportata');
    expect(descriviErroreFotocamera('boh')).toMatchObject({ tipo: 'altro' });
  });
});

describe('QR di setup', () => {
  it('accetta il testo letto dal QR con valori codificati', () => {
    expect(
      analizzaTestoSetup(
        'terminalinobru://setup?url=https%3A%2F%2Fterminalino.esempio.workers.dev&token=tk_AbC-123.xyz',
      ),
    ).toEqual({
      ok: true,
      dati: { urlBridge: 'https://terminalino.esempio.workers.dev', token: 'tk_AbC-123.xyz' },
    });
  });

  it('ignora maiuscole nel prefisso e spazi o a capo aggiunti dal lettore', () => {
    expect(
      analizzaTestoSetup('TERMINALINOBRU://SETUP?url=https://a.esempio.it/&token=abc\r\n'),
    ).toEqual({ ok: true, dati: { urlBridge: 'https://a.esempio.it', token: 'abc' } });
  });

  it('rifiuta un barcode di prodotto letto per sbaglio', () => {
    expect(analizzaTestoSetup('8001234567890')).toEqual({
      ok: false,
      errore: 'Il testo non è un codice di setup di TerminalinoBru.',
    });
    expect(analizzaTestoSetup('')).toMatchObject({ ok: false });
  });
});

describe('risoluzione dei codici letti', () => {
  let db: DatabaseTerminalino;
  afterEach(async () => {
    await db?.delete();
  });

  async function catalogo() {
    db = nuovoDb();
    await db.prodotti.bulkPut([
      prodotto('SCATOLA-40', 'Scatola cartone 40x30'),
      prodotto('8000000000001', 'Prodotto con codice numerico'),
      prodotto('nastro', 'Nastro adesivo'),
    ]);
    await db.barcode.bulkPut([
      barcode('8001234567890', 'SCATOLA-40'),
      barcode('8000000000001', 'nastro'),
      barcode('8009999999999', 'ELIMINATO'),
    ]);
  }

  it('cerca prima nei barcode', async () => {
    await catalogo();
    expect((await risolviCodice(db, '8001234567890'))?.codice).toBe('SCATOLA-40');
    // Un barcode vince su un codice prodotto identico.
    expect((await risolviCodice(db, '8000000000001'))?.codice).toBe('nastro');
  });

  it('poi nei prodotti per codice esatto', async () => {
    await catalogo();
    expect((await risolviCodice(db, 'SCATOLA-40'))?.descrizione).toBe('Scatola cartone 40x30');
    expect((await risolviCodice(db, ' nastro '))?.codice).toBe('nastro');
    expect(await risolviCodice(db, 'NASTRO')).toBeNull();
    expect(await risolviCodice(db, 'SCATOLA')).toBeNull();
  });

  it('restituisce null per codici sconosciuti, vuoti o con prodotto sparito', async () => {
    await catalogo();
    expect(await risolviCodice(db, '1234567890128')).toBeNull();
    expect(await risolviCodice(db, '   ')).toBeNull();
    expect(await risolviCodice(db, '8009999999999')).toBeNull();
  });

  it('abbina un barcode sconosciuto con origine app e lo accoda una volta sola', async () => {
    await catalogo();
    const adesso = new Date('2026-09-17T09:00:00.000Z');
    await abbinaBarcode(db, '1234567890128', 'SCATOLA-40', adesso);
    expect(await db.barcode.get('1234567890128')).toEqual({
      barcode: '1234567890128',
      codiceProdotto: 'SCATOLA-40',
      origine: 'app',
      aggiornatoIl: '2026-09-17T09:00:00.000Z',
    });
    expect((await risolviCodice(db, '1234567890128'))?.codice).toBe('SCATOLA-40');

    // Corretto l'abbinamento: la voce in coda resta una, il barcode punta al nuovo prodotto.
    await abbinaBarcode(db, '1234567890128', 'nastro', adesso);
    expect((await risolviCodice(db, '1234567890128'))?.codice).toBe('nastro');
    expect(await db.codaUpload.toArray()).toEqual([
      {
        id: expect.any(Number),
        tipo: 'barcode',
        riferimento: '1234567890128',
        creataIl: '2026-09-17T09:00:00.000Z',
        tentativi: 0,
      },
    ]);
  });

  it('non abbina a un prodotto che non esiste e non lascia nulla a metà', async () => {
    await catalogo();
    await expect(abbinaBarcode(db, '1234567890128', 'NON-ESISTE')).rejects.toThrow();
    await expect(abbinaBarcode(db, '  ', 'nastro')).rejects.toThrow();
    expect(await db.barcode.get('1234567890128')).toBeUndefined();
    expect(await db.codaUpload.count()).toBe(0);
  });
});
