import type { Prodotto } from './tipi.js';

/** Voce dell'indice di ricerca: un prodotto con le sue stringhe già normalizzate. */
export type VoceIndice = {
  prodotto: Prodotto;
  codiceNorm: string;
  descrizioneNorm: string;
};

/** Indice di ricerca in memoria, costruito una volta e riusato a ogni query. */
export type IndiceRicerca = {
  voci: VoceIndice[];
};

/** Limite di risultati usato quando il chiamante non ne indica uno. */
export const LIMITE_RICERCA_DEFAULT = 20;

/** Minuscolo, senza accenti, spazi compressi: forma di confronto per la ricerca. */
export function normalizza(testo: string): string {
  return testo
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Costruisce l'indice di ricerca dai prodotti non eliminati. */
export function costruisciIndice(prodotti: readonly Prodotto[]): IndiceRicerca {
  const voci: VoceIndice[] = [];
  for (const prodotto of prodotti) {
    if (prodotto.eliminatoIl !== undefined) continue;
    voci.push({
      prodotto,
      codiceNorm: normalizza(prodotto.codice),
      descrizioneNorm: normalizza(prodotto.descrizione),
    });
  }
  return { voci };
}

/** Spezza la query normalizzata nei token da cercare in AND. */
function token(query: string): string[] {
  const normalizzata = normalizza(query);
  return normalizzata === '' ? [] : normalizzata.split(' ');
}

/**
 * Punteggio di una voce: più basso viene prima. Priorità ai prefissi di codice,
 * poi al codice, poi alla descrizione.
 */
function punteggio(voce: VoceIndice, tokens: readonly string[], query: string): number | undefined {
  for (const t of tokens) {
    if (!voce.codiceNorm.includes(t) && !voce.descrizioneNorm.includes(t)) return undefined;
  }
  const primo = tokens[0] ?? '';
  if (voce.codiceNorm === query) return 0;
  if (voce.codiceNorm.startsWith(primo)) return 1;
  if (tokens.every((t) => voce.codiceNorm.includes(t))) return 2;
  if (voce.descrizioneNorm.startsWith(primo)) return 3;
  return 4;
}

/** Cerca nell'indice in AND sui token della query; query vuota restituisce nessun risultato. */
export function cercaProdotti(
  indice: IndiceRicerca,
  query: string,
  limite: number = LIMITE_RICERCA_DEFAULT,
): Prodotto[] {
  const tokens = token(query);
  if (tokens.length === 0 || limite <= 0) return [];
  const queryNorm = tokens.join(' ');
  const trovati: { voce: VoceIndice; punti: number }[] = [];
  for (const voce of indice.voci) {
    const punti = punteggio(voce, tokens, queryNorm);
    if (punti !== undefined) trovati.push({ voce, punti });
  }
  trovati.sort(
    (a, b) => a.punti - b.punti || a.voce.codiceNorm.localeCompare(b.voce.codiceNorm, 'it'),
  );
  return trovati.slice(0, limite).map((t) => t.voce.prodotto);
}
