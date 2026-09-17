import {
  aggregaRighe,
  arrotondaQuantita,
  type Prodotto,
  type Riga,
  type TipoSessione,
} from '@terminalinobru/core';

/** Una voce del riepilogo: un prodotto con la somma delle sue righe. */
export type VoceRiepilogo = {
  codice: string;
  descrizione?: string;
  quantita: number;
  /** Quante righe (letture) sono confluite nella voce. */
  righe: number;
  /** Solo per inventario: giacenza teorica dal catalogo, se nota. */
  giacenza?: number;
  /** Solo per inventario: quantità rilevata meno giacenza teorica, se la giacenza è nota. */
  differenza?: number;
};

export type Riepilogo = {
  voci: VoceRiepilogo[];
  totaleRighe: number;
  totalePezzi: number;
  /** Solo per inventario: voci con quantità diversa dalla giacenza teorica. */
  vociConDifferenza: number;
  /** Solo per inventario: voci di prodotti senza giacenza nel catalogo. */
  vociSenzaGiacenza: number;
};

/**
 * Riepilogo prima della chiusura: righe aggregate per prodotto con `aggregaRighe` (stesso ordine
 * del file), totali e, per l'inventario, differenze rispetto alla giacenza teorica.
 */
export function calcolaRiepilogo(
  tipo: TipoSessione,
  righe: readonly Riga[],
  prodotti: ReadonlyMap<string, Prodotto>,
): Riepilogo {
  const conteggi = new Map<string, number>();
  for (const riga of righe) {
    conteggi.set(riga.codiceProdotto, (conteggi.get(riga.codiceProdotto) ?? 0) + 1);
  }
  let vociConDifferenza = 0;
  let vociSenzaGiacenza = 0;
  const voci = aggregaRighe(righe).map(({ codice, quantita }): VoceRiepilogo => {
    const prodotto = prodotti.get(codice);
    const voce: VoceRiepilogo = { codice, quantita, righe: conteggi.get(codice) ?? 0 };
    if (prodotto) voce.descrizione = prodotto.descrizione;
    if (tipo === 'inventario') {
      if (prodotto?.giacenza === undefined) {
        vociSenzaGiacenza += 1;
      } else {
        voce.giacenza = prodotto.giacenza;
        voce.differenza = arrotondaQuantita(quantita - prodotto.giacenza);
        if (voce.differenza !== 0) vociConDifferenza += 1;
      }
    }
    return voce;
  });
  return {
    voci,
    totaleRighe: righe.length,
    totalePezzi: arrotondaQuantita(voci.reduce((somma, voce) => somma + voce.quantita, 0)),
    vociConDifferenza,
    vociSenzaGiacenza,
  };
}
