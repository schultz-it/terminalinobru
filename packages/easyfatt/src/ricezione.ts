/** Parametri del polling con cui Easyfatt chiede i documenti (docs/PROTOCOLLI-DANEA.md sezione 3). */
export type ParametriRicezione = {
  appver?: string;
  /** Data minima, `yyyy-mm-dd`. */
  firstdate?: string;
  /** Data massima, `yyyy-mm-dd`. */
  lastdate?: string;
  /** Numero documento minimo, intero ≥ 1. */
  firstnum?: number;
  /** Numero documento massimo, intero ≥ 1. */
  lastnum?: number;
};

/** Errore nei parametri del polling, con messaggio in italiano da mostrare in Easyfatt. */
export class ErroreRicezione extends Error {
  constructor(messaggio: string) {
    super(messaggio);
    this.name = 'ErroreRicezione';
  }
}

const RE_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;
const RE_INTERO = /^\d+$/;

/** Valore del parametro, undefined se assente o vuoto. */
function valore(query: Record<string, string | undefined>, nome: string): string | undefined {
  const testo = query[nome]?.trim();
  return testo === undefined || testo === '' ? undefined : testo;
}

/** Legge una data `yyyy-mm-dd` esistente nel calendario. */
function data(query: Record<string, string | undefined>, nome: string): string | undefined {
  const testo = valore(query, nome);
  if (testo === undefined) return undefined;
  const parti = RE_DATA.exec(testo);
  if (parti !== null) {
    const [anno, mese, giorno] = parti.slice(1).map(Number) as [number, number, number];
    const calendario = new Date(Date.UTC(anno, mese - 1, giorno));
    if (calendario.getUTCMonth() === mese - 1 && calendario.getUTCDate() === giorno) return testo;
  }
  throw new ErroreRicezione(
    `Parametro ${nome} non valido: "${testo}". Serve una data nel formato aaaa-mm-gg.`,
  );
}

/** Legge un intero ≥ 1. */
function numero(query: Record<string, string | undefined>, nome: string): number | undefined {
  const testo = valore(query, nome);
  if (testo === undefined) return undefined;
  const intero = RE_INTERO.test(testo) ? Number(testo) : Number.NaN;
  if (!Number.isSafeInteger(intero) || intero < 1) {
    throw new ErroreRicezione(
      `Parametro ${nome} non valido: "${testo}". Serve un numero intero da 1 in su.`,
    );
  }
  return intero;
}

/**
 * Interpreta i parametri del polling documenti di Easyfatt. Parametri assenti o vuoti restano
 * undefined; valori malformati sollevano {@link ErroreRicezione}.
 */
export function analizzaParametriRicezione(
  query: Record<string, string | undefined>,
): ParametriRicezione {
  const parametri: ParametriRicezione = {};
  const appver = valore(query, 'appver');
  if (appver !== undefined) parametri.appver = appver;
  const firstdate = data(query, 'firstdate');
  if (firstdate !== undefined) parametri.firstdate = firstdate;
  const lastdate = data(query, 'lastdate');
  if (lastdate !== undefined) parametri.lastdate = lastdate;
  const firstnum = numero(query, 'firstnum');
  if (firstnum !== undefined) parametri.firstnum = firstnum;
  const lastnum = numero(query, 'lastnum');
  if (lastnum !== undefined) parametri.lastnum = lastnum;
  return parametri;
}
