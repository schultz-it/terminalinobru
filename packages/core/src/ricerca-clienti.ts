import { normalizza } from './ricerca.js';
import type { Cliente } from './tipi.js';

/** Voce dell'indice dei clienti: un cliente con le sue stringhe già normalizzate. */
export type VoceIndiceClienti = {
  cliente: Cliente;
  nomeNorm: string;
  codiceNorm: string;
  partitaIvaNorm: string;
};

/** Indice di ricerca dei clienti in memoria, costruito una volta e riusato a ogni query. */
export type IndiceClienti = {
  voci: VoceIndiceClienti[];
};

/** Costruisce l'indice di ricerca dai clienti non eliminati. */
export function costruisciIndiceClienti(clienti: readonly Cliente[]): IndiceClienti {
  const voci: VoceIndiceClienti[] = [];
  for (const cliente of clienti) {
    if (cliente.eliminatoIl !== undefined) continue;
    voci.push({
      cliente,
      nomeNorm: normalizza(cliente.nome),
      codiceNorm: normalizza(cliente.codice ?? ''),
      partitaIvaNorm: normalizza(cliente.partitaIva ?? ''),
    });
  }
  return { voci };
}

/**
 * Punteggio di una voce: più basso viene prima. Codice o partita IVA identici, poi prefissi di
 * codice o partita IVA, poi nome che inizia con la query, poi il resto.
 */
function punteggio(voce: VoceIndiceClienti, tokens: readonly string[], query: string) {
  for (const t of tokens) {
    if (
      !voce.nomeNorm.includes(t) &&
      !voce.codiceNorm.includes(t) &&
      !voce.partitaIvaNorm.includes(t)
    ) {
      return undefined;
    }
  }
  if (voce.codiceNorm === query || voce.partitaIvaNorm === query) return 0;
  const primo = tokens[0] ?? '';
  if (
    tokens.length === 1 &&
    ((voce.codiceNorm !== '' && voce.codiceNorm.startsWith(primo)) ||
      (voce.partitaIvaNorm !== '' && voce.partitaIvaNorm.startsWith(primo)))
  ) {
    return 1;
  }
  if (voce.nomeNorm.startsWith(query)) return 2;
  if (voce.nomeNorm.startsWith(primo)) return 3;
  return 4;
}

/**
 * Cerca i clienti per nome, codice o partita IVA, in AND sui token della query. Query vuota
 * restituisce nessun risultato. A parità di punteggio, ordine alfabetico del nome.
 */
export function cercaClienti(indice: IndiceClienti, query: string, limite: number): Cliente[] {
  const normalizzata = normalizza(query);
  if (normalizzata === '' || limite <= 0) return [];
  const tokens = normalizzata.split(' ');
  const trovati: { voce: VoceIndiceClienti; punti: number }[] = [];
  for (const voce of indice.voci) {
    const punti = punteggio(voce, tokens, normalizzata);
    if (punti !== undefined) trovati.push({ voce, punti });
  }
  trovati.sort((a, b) => a.punti - b.punti || a.voce.nomeNorm.localeCompare(b.voce.nomeNorm, 'it'));
  return trovati.slice(0, limite).map((t) => t.voce.cliente);
}
