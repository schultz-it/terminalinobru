// Lettura e scrittura minimale di PNG RGBA a 8 bit, senza dipendenze: serve solo agli script una tantum.
import { Buffer } from 'node:buffer';
import { deflateSync, inflateSync } from 'node:zlib';

const FIRMA = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const TABELLA_CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(buffer) {
  let c = -1;
  for (const byte of buffer) c = TABELLA_CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Decodifica un PNG non interlacciato RGBA o RGB a 8 bit in `{ larghezza, altezza, pixel }`. */
export function leggiPng(dati) {
  if (!dati.subarray(0, 8).equals(FIRMA)) throw new Error('Non è un PNG');
  let posizione = 8;
  let larghezza = 0;
  let altezza = 0;
  let canali = 4;
  const idat = [];
  while (posizione < dati.length) {
    const lunghezza = dati.readUInt32BE(posizione);
    const tipo = dati.toString('ascii', posizione + 4, posizione + 8);
    const corpo = dati.subarray(posizione + 8, posizione + 8 + lunghezza);
    if (tipo === 'IHDR') {
      larghezza = corpo.readUInt32BE(0);
      altezza = corpo.readUInt32BE(4);
      const profondita = corpo[8];
      const colore = corpo[9];
      if (profondita !== 8 || (colore !== 6 && colore !== 2) || corpo[12] !== 0) {
        throw new Error('Formato PNG non gestito');
      }
      canali = colore === 6 ? 4 : 3;
    } else if (tipo === 'IDAT') {
      idat.push(corpo);
    }
    posizione += 12 + lunghezza;
  }
  const grezzo = inflateSync(Buffer.concat(idat));
  const passo = canali;
  const riga = larghezza * passo;
  const decodificato = Buffer.alloc(altezza * riga);
  for (let y = 0; y < altezza; y++) {
    const filtro = grezzo[y * (riga + 1)];
    for (let x = 0; x < riga; x++) {
      const valore = grezzo[y * (riga + 1) + 1 + x];
      const a = x >= passo ? decodificato[y * riga + x - passo] : 0;
      const b = y > 0 ? decodificato[(y - 1) * riga + x] : 0;
      const c = x >= passo && y > 0 ? decodificato[(y - 1) * riga + x - passo] : 0;
      const predetto = [0, a, b, (a + b) >> 1, paeth(a, b, c)][filtro];
      decodificato[y * riga + x] = (valore + predetto) & 0xff;
    }
  }
  const pixel = Buffer.alloc(larghezza * altezza * 4);
  for (let i = 0; i < larghezza * altezza; i++) {
    pixel[i * 4] = decodificato[i * passo];
    pixel[i * 4 + 1] = decodificato[i * passo + 1];
    pixel[i * 4 + 2] = decodificato[i * passo + 2];
    pixel[i * 4 + 3] = canali === 4 ? decodificato[i * passo + 3] : 255;
  }
  return { larghezza, altezza, pixel };
}

function blocco(tipo, corpo) {
  const lunghezza = Buffer.alloc(4);
  lunghezza.writeUInt32BE(corpo.length);
  const tipoECorpo = Buffer.concat([Buffer.from(tipo, 'ascii'), corpo]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(tipoECorpo));
  return Buffer.concat([lunghezza, tipoECorpo, crc]);
}

/** Codifica pixel RGBA in PNG, senza filtri. */
export function scriviPng({ larghezza, altezza, pixel }) {
  const intestazione = Buffer.alloc(13);
  intestazione.writeUInt32BE(larghezza, 0);
  intestazione.writeUInt32BE(altezza, 4);
  intestazione[8] = 8;
  intestazione[9] = 6;
  const grezzo = Buffer.alloc(altezza * (larghezza * 4 + 1));
  for (let y = 0; y < altezza; y++) {
    pixel.copy(grezzo, y * (larghezza * 4 + 1) + 1, y * larghezza * 4, (y + 1) * larghezza * 4);
  }
  return Buffer.concat([
    FIRMA,
    blocco('IHDR', intestazione),
    blocco('IDAT', deflateSync(grezzo, { level: 9 })),
    blocco('IEND', Buffer.alloc(0)),
  ]);
}
