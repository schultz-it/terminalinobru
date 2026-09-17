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
    'Nuovo documento > righe > Utilità > Importa da terminale portatile, dopo aver scelto il ' +
    'cliente: il prezzo applicato è quello del suo listino. Lo scarico avviene al salvataggio ' +
    'del documento.',
  carico:
    'Nuovo Arrivo merce > Utilità > Importa da terminale portatile. Il carico avviene al ' +
    'salvataggio.',
};
