import { normalizza } from '@terminalinobru/core';

/** Pezzo di testo da mostrare, evidenziato se corrisponde a un token della ricerca. */
export type Segmento = { testo: string; evidenziato: boolean };

/**
 * Divide `testo` in segmenti evidenziando le parti che corrispondono ai token di `query`, con lo
 * stesso confronto della ricerca (minuscole, senza accenti). Le posizioni restano quelle del testo
 * originale, accenti compresi.
 */
export function segmentiEvidenziati(testo: string, query: string): Segmento[] {
  const tokens = normalizza(query)
    .split(' ')
    .filter((t) => t !== '');
  if (testo === '') return [];
  if (tokens.length === 0) return [{ testo, evidenziato: false }];

  // Forma normalizzata carattere per carattere, con la posizione originale di ciascun carattere.
  let normalizzato = '';
  const origine: number[] = [];
  let indice = 0;
  for (const carattere of testo) {
    const forma = carattere
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/\s/g, ' ');
    for (let k = 0; k < forma.length; k++) {
      normalizzato += forma[k];
      origine.push(indice);
    }
    indice += carattere.length;
  }

  const marcato = new Array<boolean>(testo.length).fill(false);
  for (const token of tokens) {
    let da = normalizzato.indexOf(token);
    while (da !== -1) {
      const inizio = origine[da] ?? 0;
      const ultimo = origine[da + token.length - 1] ?? inizio;
      const fine = ultimo + (testo.codePointAt(ultimo)! > 0xffff ? 2 : 1);
      for (let i = inizio; i < fine; i++) marcato[i] = true;
      da = normalizzato.indexOf(token, da + 1);
    }
  }

  const segmenti: Segmento[] = [];
  for (let i = 0; i < testo.length; i++) {
    const ultimo = segmenti[segmenti.length - 1];
    const evidenziato = marcato[i] ?? false;
    if (ultimo && ultimo.evidenziato === evidenziato) ultimo.testo += testo[i];
    else segmenti.push({ testo: testo[i] ?? '', evidenziato });
  }
  return segmenti;
}
