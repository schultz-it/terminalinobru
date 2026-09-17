import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router';
import { db } from '../db.js';
import { preparaAudio } from './feedback.js';
import { risolviCodice } from './risolvi.js';
import { Scanner } from './Scanner.js';
import type { EsitoLettura } from './tipi.js';

/** Percorso della scheda prodotto. */
export function percorsoScheda(codice: string): string {
  return `/consulta/${encodeURIComponent(codice)}`;
}

/** Percorso del flusso "Abbina a un prodotto" per un barcode sconosciuto. */
export function percorsoAbbina(barcode: string): string {
  return `/consulta/abbina/${encodeURIComponent(barcode)}`;
}

/**
 * Scanner della Consultazione, usato dalla ricerca e dalla scheda prodotto: un codice trovato
 * porta alla scheda, un codice sconosciuto al flusso di abbinamento.
 */
export function useScansioneConsultazione() {
  const [aperto, setAperto] = useState(false);
  const naviga = useNavigate();

  const apri = useCallback(() => {
    // Siamo dentro il tocco sul pulsante: è il momento di sbloccare l'audio.
    preparaAudio();
    setAperto(true);
  }, []);
  const chiudi = useCallback(() => setAperto(false), []);

  const onCodice = useCallback(
    async (codice: string): Promise<EsitoLettura> => {
      const prodotto = await risolviCodice(db, codice);
      setAperto(false);
      if (prodotto) {
        void naviga(percorsoScheda(prodotto.codice));
        return 'trovato';
      }
      void naviga(percorsoAbbina(codice));
      return 'sconosciuto';
    },
    [naviga],
  );

  const scanner = aperto ? (
    <Scanner titolo="Scansiona prodotto" onCodice={onCodice} onChiudi={chiudi} />
  ) : null;

  return { apri, scanner };
}
