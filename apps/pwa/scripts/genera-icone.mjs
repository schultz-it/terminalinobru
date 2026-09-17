// Script una tantum: ritaglia la testa dello schnauzer da docs/brand/logo-imballare.png e genera le
// icone della PWA (docs/STILE.md sezione 5). Uso: `node apps/pwa/scripts/genera-icone.mjs`.
// Nessuna dipendenza: PNG letti e scritti con node:zlib (vedi png.mjs).
import { Buffer } from 'node:buffer';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leggiPng, scriviPng } from './png.mjs';

const cartella = dirname(fileURLToPath(import.meta.url));
const radice = join(cartella, '..', '..', '..');
const uscita = join(cartella, '..', 'public');

const GIALLO = [0xf2, 0xce, 0x2e];
const NERO = [0x14, 0x14, 0x14];

const logo = leggiPng(readFileSync(join(radice, 'docs/brand/logo-imballare.png')));

// La testa usata è quella accanto a "Brunelli Imballaggi": sfondo trasparente e profilo pulito.
// Il suo collo tocca il bordo scuro del cartiglio, che ha lo stesso colore: lo si esclude con un
// taglio obliquo del collo, da dietro l'orecchio fino alla base, come un busto.
const SEME = { x: 560, y: 60 };
const TAGLIO = { alto: { x: 600, y: 38 }, basso: { x: 572, y: 108 } };
/** Quanto del pixel (x, y) resta al di qua del taglio, da 0 a 1, con bordo antialias. */
function restaDopoTaglio(x, y) {
  if (x < 480) return 0;
  const pendenza = (TAGLIO.basso.x - TAGLIO.alto.x) / (TAGLIO.basso.y - TAGLIO.alto.y);
  const limite = y < TAGLIO.alto.y ? TAGLIO.alto.x : TAGLIO.alto.x + (y - TAGLIO.alto.y) * pendenza;
  const distanza = (limite - x - 0.5) / Math.hypot(1, y < TAGLIO.alto.y ? 0 : pendenza);
  return Math.min(1, Math.max(0, distanza + 0.5));
}
const dentroZona = (x, y) => restaDopoTaglio(x, y) > 0;

function pixel(x, y) {
  const i = (y * logo.larghezza + x) * 4;
  const [r, g, b, a] = logo.pixel.subarray(i, i + 4);
  return { luminanza: 0.299 * r + 0.587 * g + 0.114 * b, alfa: a / 255 };
}

const scuro = (x, y) => {
  const p = pixel(x, y);
  return p.alfa > 0.5 && p.luminanza < 128;
};

// Componente connessa dei pixel scuri a partire dal seme, dentro la zona.
const inTesta = new Uint8Array(logo.larghezza * logo.altezza);
const pila = [[SEME.x, SEME.y]];
while (pila.length > 0) {
  const [x, y] = pila.pop();
  if (!dentroZona(x, y) || inTesta[y * logo.larghezza + x] || !scuro(x, y)) continue;
  inTesta[y * logo.larghezza + x] = 1;
  pila.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
}

// Maschera di copertura: la componente dilatata di 2 px (bordi antialias e dettagli chiari interni
// che restano trasparenti), con opacità proporzionale a quanto il pixel è scuro.
let minX = Infinity;
let minY = Infinity;
let maxX = -Infinity;
let maxY = -Infinity;
const copertura = new Float32Array(logo.larghezza * logo.altezza);
for (let y = 0; y < logo.altezza; y++) {
  for (let x = 0; x < logo.larghezza; x++) {
    if (!dentroZona(x, y)) continue;
    let vicino = false;
    for (let dy = -2; dy <= 2 && !vicino; dy++) {
      for (let dx = -2; dx <= 2 && !vicino; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < logo.larghezza && ny < logo.altezza) {
          vicino = inTesta[ny * logo.larghezza + nx] === 1;
        }
      }
    }
    if (!vicino) continue;
    const p = pixel(x, y);
    const valore =
      p.alfa * Math.min(1, Math.max(0, (215 - p.luminanza) / 150)) * restaDopoTaglio(x, y);
    copertura[y * logo.larghezza + x] = valore;
    if (valore > 0.05) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
}
const larghezzaTesta = maxX - minX + 1;
const altezzaTesta = maxY - minY + 1;

function coperturaInterpolata(x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const v = (px, py) =>
    px < minX || py < minY || px > maxX || py > maxY ? 0 : copertura[py * logo.larghezza + px];
  return (
    v(x0, y0) * (1 - fx) * (1 - fy) +
    v(x0 + 1, y0) * fx * (1 - fy) +
    v(x0, y0 + 1) * (1 - fx) * fy +
    v(x0 + 1, y0 + 1) * fx * fy
  );
}

/** Copertura del quadrato con angoli arrotondati nel punto (x, y), con 1 px di antialias. */
function coperturaQuadrato(x, y, lato, raggio) {
  if (raggio === 0) return 1;
  const cx = Math.min(Math.max(x, raggio), lato - raggio);
  const cy = Math.min(Math.max(y, raggio), lato - raggio);
  const distanza = Math.hypot(x - cx, y - cy);
  return Math.min(1, Math.max(0, raggio - distanza + 0.5));
}

/**
 * Icona quadrata: fondo giallo, testa nera centrata che occupa `quota` del lato.
 * Sovracampionamento 4×4 per pixel.
 */
function generaIcona(lato, { quota, raggio }) {
  const scala = (lato * quota) / Math.max(larghezzaTesta, altezzaTesta);
  const offsetX = (lato - larghezzaTesta * scala) / 2;
  const offsetY = (lato - altezzaTesta * scala) / 2;
  const pixelIcona = Buffer.alloc(lato * lato * 4);
  const CAMPIONI = 4;
  for (let y = 0; y < lato; y++) {
    for (let x = 0; x < lato; x++) {
      let testa = 0;
      let fondo = 0;
      for (let sy = 0; sy < CAMPIONI; sy++) {
        for (let sx = 0; sx < CAMPIONI; sx++) {
          const px = x + (sx + 0.5) / CAMPIONI;
          const py = y + (sy + 0.5) / CAMPIONI;
          fondo += coperturaQuadrato(px, py, lato, raggio);
          testa += coperturaInterpolata(
            minX + (px - offsetX) / scala - 0.5,
            minY + (py - offsetY) / scala - 0.5,
          );
        }
      }
      testa /= CAMPIONI * CAMPIONI;
      fondo /= CAMPIONI * CAMPIONI;
      const o = (y * lato + x) * 4;
      for (let k = 0; k < 3; k++) {
        pixelIcona[o + k] = Math.round(GIALLO[k] * (1 - testa) + NERO[k] * testa);
      }
      pixelIcona[o + 3] = Math.round(255 * fondo);
    }
  }
  return scriviPng({ larghezza: lato, altezza: lato, pixel: pixelIcona });
}

const icone = [
  ['icona-192.png', 192, { quota: 0.72, raggio: 192 * 0.18 }],
  ['icona-512.png', 512, { quota: 0.72, raggio: 512 * 0.18 }],
  // Maskable: fondo pieno, testa dentro la zona sicura centrale (80%) con margine.
  ['icona-maskable-192.png', 192, { quota: 0.56, raggio: 0 }],
  ['icona-maskable-512.png', 512, { quota: 0.56, raggio: 0 }],
  ['apple-touch-icon.png', 180, { quota: 0.62, raggio: 0 }],
];
for (const [nome, lato, opzioni] of icone) {
  writeFileSync(join(uscita, nome), generaIcona(lato, opzioni));
  console.log(`scritto public/${nome}`);
}

// Logo "imballare.net" piccolo per il piede della schermata Impostazioni (docs/STILE.md sezione 5):
// parte sinistra del file del marchio, ridotta ad altezza 64 px (doppia densità per 32 px a schermo).
function riduciLogo({ x0, x1, altezza }) {
  const scala = logo.altezza / altezza;
  const larghezza = Math.round((x1 - x0) / scala);
  const pixelLogo = Buffer.alloc(larghezza * altezza * 4);
  for (let y = 0; y < altezza; y++) {
    for (let x = 0; x < larghezza; x++) {
      const somma = [0, 0, 0, 0];
      let conteggio = 0;
      for (let sy = Math.floor(y * scala); sy < Math.floor((y + 1) * scala); sy++) {
        for (let sx = x0 + Math.floor(x * scala); sx < x0 + Math.floor((x + 1) * scala); sx++) {
          const i = (sy * logo.larghezza + sx) * 4;
          // Il muso della seconda testa sporge sopra la "t" di ".net": lo si esclude.
          const a = sx >= 505 && sy < 90 ? 0 : logo.pixel[i + 3];
          for (let k = 0; k < 3; k++) somma[k] += logo.pixel[i + k] * a;
          somma[3] += a;
          conteggio++;
        }
      }
      const o = (y * larghezza + x) * 4;
      for (let k = 0; k < 3; k++) pixelLogo[o + k] = somma[3] ? Math.round(somma[k] / somma[3]) : 0;
      pixelLogo[o + 3] = Math.round(somma[3] / conteggio);
    }
  }
  return scriviPng({ larghezza, altezza, pixel: pixelLogo });
}
writeFileSync(
  join(cartella, '..', 'src', 'risorse', 'logo-imballare-net.png'),
  riduciLogo({ x0: 0, x1: 528, altezza: 64 }),
);
console.log('scritto src/risorse/logo-imballare-net.png');
