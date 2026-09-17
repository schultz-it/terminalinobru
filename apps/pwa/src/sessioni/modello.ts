import type { ModalitaScansione, StatoSessione, TipoSessione } from '@terminalinobru/core';

/** Etichette dei tipi di sessione, come le legge l'utente. */
export const ETICHETTE_TIPO: Record<TipoSessione, string> = {
  inventario: 'Inventario',
  ddt: 'DDT',
  carico: 'Carico',
};

/** Spiegazione breve di ogni tipo, per la scelta nella nuova sessione. */
export const DESCRIZIONI_TIPO: Record<TipoSessione, string> = {
  inventario: 'Conta la merce: la quantità rettifica la giacenza',
  ddt: 'Merce in uscita da importare in un DDT',
  carico: 'Merce in arrivo da un fornitore',
};

export const ETICHETTE_STATO: Record<StatoSessione, string> = {
  aperta: 'Aperta',
  chiusa: 'Chiusa',
  esportata: 'Esportata',
  importata: 'Importata',
};

export const ETICHETTE_MODALITA: Record<ModalitaScansione, string> = {
  chiedi_quantita: 'Chiedi quantità',
  somma_uno: 'Somma uno',
};

export const DESCRIZIONI_MODALITA: Record<ModalitaScansione, string> = {
  chiedi_quantita: 'Dopo ogni lettura scrivi la quantità',
  somma_uno: 'Ogni lettura aggiunge un pezzo',
};

const due = (n: number) => String(n).padStart(2, '0');

/** Nome proposto per una nuova sessione: `<Tipo> <gg/mm/aaaa> <hh:mm>` in ora locale. */
export function nomeProposto(tipo: TipoSessione, adesso: Date): string {
  const data = `${due(adesso.getDate())}/${due(adesso.getMonth() + 1)}/${adesso.getFullYear()}`;
  const ora = `${due(adesso.getHours())}:${due(adesso.getMinutes())}`;
  return `${ETICHETTE_TIPO[tipo]} ${data} ${ora}`;
}

/**
 * Nome del file del terminalino condiviso dal telefono, sulla falsariga di quello del bridge:
 * `terminale-<tipo>-<nome>-<aaaammgg>.txt`, senza accenti né spazi.
 */
export function nomeFileTerminale(tipo: TipoSessione, nome: string, data: Date): string {
  const pulito =
    nome
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'sessione';
  const giorno = `${data.getFullYear()}${due(data.getMonth() + 1)}${due(data.getDate())}`;
  return `terminale-${tipo}-${pulito}-${giorno}.txt`;
}

/** Identificativo UUID v4. `crypto.randomUUID` esiste solo in contesto sicuro: altrimenti a mano. */
export function generaUuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const byte = crypto.getRandomValues(new Uint8Array(16));
  byte[6] = (byte[6]! & 0x0f) | 0x40;
  byte[8] = (byte[8]! & 0x3f) | 0x80;
  const esa = [...byte].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${esa.slice(0, 8)}-${esa.slice(8, 12)}-${esa.slice(12, 16)}-${esa.slice(16, 20)}-${esa.slice(20)}`;
}
