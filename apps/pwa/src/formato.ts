const numero = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 3 });
const euro = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});
const dataOra = new Intl.DateTimeFormat('it-IT', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** Quantità in formato italiano, trattino se assente. */
export function formattaNumero(valore: number | null | undefined): string {
  return valore === null || valore === undefined ? '—' : numero.format(valore);
}

/** Prezzo in euro, trattino se il listino non è valorizzato. */
export function formattaPrezzo(valore: number | null | undefined): string {
  return valore === null || valore === undefined ? '—' : euro.format(valore);
}

/** Data e ora locali da una stringa ISO, oppure il testo di ripiego. */
export function formattaDataOra(iso: string | null | undefined, ripiego = 'mai'): string {
  if (!iso) return ripiego;
  const istante = Date.parse(iso);
  return Number.isNaN(istante) ? ripiego : dataOra.format(istante);
}
