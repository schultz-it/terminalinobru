import { describe, expect, it } from 'vitest';
import {
  analizzaStringaFormato,
  generaFileTerminale,
  type LetteraDelimitata,
  type RigaTerminale,
} from '../src/index.js';

/**
 * Generatore pseudo casuale deterministico (congruenza lineare): serve per i test di proprietà
 * senza aggiungere dipendenze.
 */
function generatore(seme: number) {
  let stato = seme;
  const prossimo = (): number => {
    stato = (stato * 1103515245 + 12345) % 2147483648;
    return stato / 2147483648;
  };
  return {
    intero: (min: number, max: number): number => min + Math.floor(prossimo() * (max - min + 1)),
    scelta: <T>(valori: readonly T[]): T => valori[Math.floor(prossimo() * valori.length)] as T,
    booleano: (): boolean => prossimo() < 0.5,
  };
}

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+_-.';
const SEPARATORI = [',', ';', '/', '|', '\t'] as const;

/** Codice prodotto casuale, senza spazi e senza i caratteri usati come separatore. */
function codiceCasuale(rnd: ReturnType<typeof generatore>, lunghezza: number): string {
  let codice = '';
  for (let i = 0; i < lunghezza; i += 1) codice += rnd.scelta([...ALFABETO]);
  return codice;
}

/** Quantità casuale con al massimo `decimali` cifre decimali. */
function quantitaCasuale(rnd: ReturnType<typeof generatore>, decimali: number): number {
  const intera = rnd.intero(0, 999);
  if (decimali === 0) return intera;
  const parte = rnd.intero(0, 10 ** decimali - 1);
  return Number((intera + parte / 10 ** decimali).toFixed(decimali));
}

/** Riga casuale, con lotto e scadenza presenti a caso. */
function rigaCasuale(rnd: ReturnType<typeof generatore>, decimali: number): RigaTerminale {
  const riga: RigaTerminale = {
    codice: codiceCasuale(rnd, rnd.intero(1, 12)),
    quantita: quantitaCasuale(rnd, decimali),
  };
  if (rnd.booleano()) riga.lotto = `LOT${rnd.intero(1, 999)}`;
  if (rnd.booleano()) {
    const mese = String(rnd.intero(1, 12)).padStart(2, '0');
    const giorno = String(rnd.intero(1, 28)).padStart(2, '0');
    riga.scadenza = `${rnd.intero(2026, 2030)}-${mese}-${giorno}`;
  }
  return riga;
}

/** Valore atteso di un campo, come deve comparire nel file. */
function attesoDelimitato(
  lettera: LetteraDelimitata,
  riga: RigaTerminale,
  separatoreDecimale: string,
): string {
  switch (lettera) {
    case 'A':
      return riga.codice;
    case 'Q': {
      const testo = String(riga.quantita);
      return separatoreDecimale === ',' ? testo.replace('.', ',') : testo;
    }
    case 'L':
      return riga.lotto ?? '';
    case 'S':
      return typeof riga.scadenza === 'string' ? riga.scadenza.replace(/-/g, '') : '';
    case 'X':
      return '';
  }
}

describe('round trip stringa formato → file → righe attese, campi delimitati', () => {
  it('rilegge sempre i campi scritti, su 200 formati casuali', () => {
    const rnd = generatore(20260916);
    for (let prova = 0; prova < 200; prova += 1) {
      const separatore = rnd.scelta(SEPARATORI);
      const separatoreDecimale = separatore === ',' ? '.' : rnd.scelta(['.', ','] as const);
      const opzionali: LetteraDelimitata[] = ['L', 'S', 'X'].filter(() =>
        rnd.booleano(),
      ) as LetteraDelimitata[];
      const campi: LetteraDelimitata[] = rnd.booleano()
        ? ['A', 'Q', ...opzionali]
        : ['Q', 'A', ...opzionali];
      const stringaFormato = campi.join(separatore);
      const formato = analizzaStringaFormato(stringaFormato);
      expect(formato.ok).toBe(true);

      const righe = Array.from({ length: rnd.intero(1, 5) }, () => rigaCasuale(rnd, 3));
      const testo = generaFileTerminale(righe, {
        stringaFormato,
        separatoreDecimale,
        fineRiga: '\n',
      });

      const linee = testo.split('\n').slice(0, -1);
      expect(linee).toHaveLength(righe.length);
      linee.forEach((linea, indice) => {
        const riga = righe[indice] as RigaTerminale;
        const valori = linea.split(separatore);
        expect(valori).toHaveLength(campi.length);
        campi.forEach((lettera, posizione) => {
          expect(valori[posizione]).toBe(attesoDelimitato(lettera, riga, separatoreDecimale));
        });
        const quantitaLetta = Number(
          (valori[campi.indexOf('Q')] as string).replace(separatoreDecimale, '.'),
        );
        expect(quantitaLetta).toBeCloseTo(riga.quantita, 3);
      });
    }
  });
});

describe('round trip stringa formato → file → righe attese, spaziatura fissa', () => {
  it('rilegge sempre le quantità scritte, su 200 formati casuali', () => {
    const rnd = generatore(4242);
    for (let prova = 0; prova < 200; prova += 1) {
      const lunghezzaCodice = rnd.intero(4, 14);
      const cifreIntere = rnd.intero(3, 5);
      const decimali = rnd.intero(0, 3);
      const conLotto = rnd.booleano();
      const conScadenza = rnd.booleano();
      const stringaFormato =
        'A'.repeat(lunghezzaCodice) +
        'Q'.repeat(cifreIntere) +
        'q'.repeat(decimali) +
        (conLotto ? 'L'.repeat(6) : '') +
        (conScadenza ? 'S'.repeat(8) : '');
      expect(analizzaStringaFormato(stringaFormato).ok).toBe(true);

      const righe = Array.from({ length: rnd.intero(1, 5) }, () => {
        const riga = rigaCasuale(rnd, decimali);
        riga.codice = riga.codice.slice(0, lunghezzaCodice);
        return riga;
      });
      const testo = generaFileTerminale(righe, { stringaFormato, fineRiga: '\n' });
      const lunghezzaRiga =
        lunghezzaCodice + cifreIntere + decimali + (conLotto ? 6 : 0) + (conScadenza ? 8 : 0);

      const linee = testo.split('\n').slice(0, -1);
      expect(linee).toHaveLength(righe.length);
      linee.forEach((linea, indice) => {
        const riga = righe[indice] as RigaTerminale;
        expect(linea).toHaveLength(lunghezzaRiga);
        let inizio = 0;
        const prendi = (quanti: number): string => {
          const pezzo = linea.slice(inizio, inizio + quanti);
          inizio += quanti;
          return pezzo;
        };
        expect(prendi(lunghezzaCodice).trimEnd()).toBe(riga.codice);
        const intera = Number(prendi(cifreIntere));
        const parteDecimale = decimali === 0 ? 0 : Number(prendi(decimali)) / 10 ** decimali;
        expect(intera + parteDecimale).toBeCloseTo(riga.quantita, decimali);
        if (conLotto) expect(prendi(6).trimEnd()).toBe(riga.lotto ?? '');
        if (conScadenza) {
          const scadenza = prendi(8).trimEnd();
          expect(scadenza).toBe(
            typeof riga.scadenza === 'string' ? riga.scadenza.replace(/-/g, '') : '',
          );
        }
      });
    }
  });
});
