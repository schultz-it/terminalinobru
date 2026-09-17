import type { Barcode, Prodotto } from '@terminalinobru/core';
import type { DatabaseTerminalino } from '../db.js';

/**
 * Trova il prodotto di un codice letto: prima fra i barcode (di Easyfatt o abbinati in app),
 * poi fra i prodotti per codice esatto. `null` se il codice è sconosciuto.
 */
export async function risolviCodice(
  db: DatabaseTerminalino,
  codice: string,
): Promise<Prodotto | null> {
  const pulito = codice.trim();
  if (pulito === '') return null;
  const voce = await db.barcode.get(pulito);
  if (voce) {
    const prodotto = await db.prodotti.get(voce.codiceProdotto);
    if (prodotto) return prodotto;
  }
  return (await db.prodotti.get(pulito)) ?? null;
}

/**
 * Abbina un barcode sconosciuto a un prodotto: lo salva con origine `app`, così vale da subito
 * sul telefono, e mette in `codaUpload` l'invio al bridge. Una sola voce in coda per barcode:
 * al momento dell'invio si legge l'abbinamento più recente dallo store `barcode`.
 */
export async function abbinaBarcode(
  db: DatabaseTerminalino,
  barcode: string,
  codiceProdotto: string,
  adesso: Date = new Date(),
): Promise<Barcode> {
  const pulito = barcode.trim();
  if (pulito === '') throw new Error('Barcode vuoto');
  const istante = adesso.toISOString();
  const voce: Barcode = {
    barcode: pulito,
    codiceProdotto,
    origine: 'app',
    aggiornatoIl: istante,
  };
  await db.transaction('rw', db.prodotti, db.barcode, db.codaUpload, async () => {
    if (!(await db.prodotti.get(codiceProdotto))) {
      throw new Error(`Prodotto ${codiceProdotto} non presente nel catalogo`);
    }
    await db.barcode.put(voce);
    const inCoda = await db.codaUpload
      .where('tipo')
      .equals('barcode')
      .filter((v) => v.riferimento === pulito)
      .first();
    if (!inCoda) {
      await db.codaUpload.add({
        tipo: 'barcode',
        riferimento: pulito,
        creataIl: istante,
        tentativi: 0,
      });
    }
  });
  return voce;
}
