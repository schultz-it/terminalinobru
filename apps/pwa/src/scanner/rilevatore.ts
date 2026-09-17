import urlWasmZxing from 'zxing-wasm/reader/zxing_reader.wasm?url';

/** Formati letti dalla fotocamera. */
export const FORMATI_BARCODE = [
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'code_128',
  'code_39',
  'itf',
  'qr_code',
] as const;

export type FormatoBarcode = (typeof FORMATI_BARCODE)[number];

/** Barcode trovato in un fotogramma: bastano valore e formato. */
export type BarcodeRilevato = { rawValue: string; format: string };

/** Rilevatore pronto all'uso, nativo o polyfill. */
export type Rilevatore = {
  origine: 'nativo' | 'polyfill';
  formati: readonly string[];
  detect(sorgente: HTMLVideoElement): Promise<BarcodeRilevato[]>;
};

type CostruttoreRilevatore = {
  new (opzioni: { formats: string[] }): {
    detect(sorgente: HTMLVideoElement): Promise<BarcodeRilevato[]>;
  };
  getSupportedFormats(): Promise<readonly string[]>;
};

/**
 * Formati da chiedere al `BarcodeDetector` nativo, oppure `null` se il nativo non basta e serve
 * il polyfill. Alcuni browser espongono l'API senza formati (Chrome desktop su Linux) o senza
 * EAN-13, che è il minimo per un magazzino.
 */
export function scegliFormatiNativi(supportati: readonly string[]): FormatoBarcode[] | null {
  const formati = FORMATI_BARCODE.filter((formato) => supportati.includes(formato));
  return formati.includes('ean_13') ? formati : null;
}

async function creaNativo(): Promise<Rilevatore | null> {
  const Nativo = (globalThis as { BarcodeDetector?: CostruttoreRilevatore }).BarcodeDetector;
  if (!Nativo) return null;
  try {
    const formati = scegliFormatiNativi(await Nativo.getSupportedFormats());
    if (!formati) return null;
    const rilevatore = new Nativo({ formats: formati });
    return { origine: 'nativo', formati, detect: (sorgente) => rilevatore.detect(sorgente) };
  } catch {
    return null;
  }
}

async function creaPolyfill(): Promise<Rilevatore> {
  const { BarcodeDetector, prepareZXingModule } = await import('barcode-detector/ponyfill');
  // Il wasm viene dal nostro dominio, non dal CDN predefinito: deve funzionare offline.
  prepareZXingModule({
    overrides: {
      locateFile: (percorso: string, prefisso: string) =>
        percorso.endsWith('.wasm') ? urlWasmZxing : prefisso + percorso,
    },
  });
  const formati = [...FORMATI_BARCODE];
  const rilevatore = new BarcodeDetector({ formats: formati });
  return { origine: 'polyfill', formati, detect: (sorgente) => rilevatore.detect(sorgente) };
}

let inPreparazione: Promise<Rilevatore> | undefined;

/** Rilevatore condiviso: `BarcodeDetector` nativo se adatto, altrimenti il polyfill ZXing. */
export function ottieniRilevatore(): Promise<Rilevatore> {
  if (!inPreparazione) {
    const promessa = creaNativo().then((nativo) => nativo ?? creaPolyfill());
    inPreparazione = promessa;
    promessa.catch(() => {
      if (inPreparazione === promessa) inPreparazione = undefined;
    });
  }
  return inPreparazione;
}
