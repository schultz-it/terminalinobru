import type { TipoSessione } from '@terminalinobru/core';

/**
 * Percorso esatto in Easyfatt per importare il file del terminalino, uno per tipo di sessione
 * (docs/PROTOCOLLI-DANEA.md sezione 1.3).
 */
export const ISTRUZIONI_IMPORTAZIONE: Record<TipoSessione, string> = {
  inventario:
    'Magazzino > Movimenti > Rettifica > Rettifica manuale > Importa da terminale portatile. ' +
    'Causale predefinita «Rettifica giacenza». Per un inventario completo spunta anche ' +
    '«Azzera giacenza dei prodotti non in elenco».',
  ddt:
    'Il DDT arriva da solo come ordine del cliente: Strumenti > Scarica ordini da e-Commerce, ' +
    'poi apri l’ordine e usa «Genera da > DDT». Lo scarico di magazzino avviene al salvataggio ' +
    'del DDT. Il file terminale.txt resta come ripiego: Nuovo documento > righe > Utilità > ' +
    'Importa da terminale portatile, dove disponibile.',
  carico:
    'Nuovo Arrivo merce > Utilità > Importa da terminale portatile. Il carico avviene al ' +
    'salvataggio.',
};
