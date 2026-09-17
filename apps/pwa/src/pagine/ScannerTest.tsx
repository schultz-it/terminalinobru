import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { db } from '../db.js';
import { ottieniRilevatore } from '../scanner/rilevatore.js';
import { risolviCodice } from '../scanner/risolvi.js';
import { Scanner, type SorgenteLettura } from '../scanner/Scanner.js';
import { useRisolviCodice } from '../scanner/useRisolviCodice.js';

type Lettura = {
  numero: number;
  codice: string;
  sorgente: SorgenteLettura;
  ora: Date;
  dallApertura: number;
  dallaPrecedente: number | undefined;
};

const ora = new Intl.DateTimeFormat('it-IT', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  fractionalSecondDigits: 3,
});

function Esito({ codice }: { codice: string }) {
  const prodotto = useRisolviCodice(codice);
  if (prodotto === undefined) return <span>…</span>;
  return prodotto ? (
    <span className="text-giallo">{prodotto.codice}</span>
  ) : (
    <span>sconosciuto</span>
  );
}

/** Pagina di prova dello scanner, solo in sviluppo: elenca i codici letti con sorgente e tempi. */
export function ScannerTest() {
  const naviga = useNavigate();
  const apertura = useRef(performance.now());
  const [letture, setLetture] = useState<Lettura[]>([]);
  const [rilevatore, setRilevatore] = useState('…');

  useEffect(() => {
    ottieniRilevatore().then(
      (r) => setRilevatore(`${r.origine} (${r.formati.join(', ')})`),
      () => setRilevatore('non disponibile'),
    );
  }, []);

  const onCodice = useCallback(async (codice: string, sorgente: SorgenteLettura) => {
    const istante = performance.now();
    setLetture((attuali) => [
      {
        numero: (attuali[0]?.numero ?? 0) + 1,
        codice,
        sorgente,
        ora: new Date(),
        dallApertura: Math.round(istante - apertura.current),
        dallaPrecedente: attuali[0]
          ? Math.round(istante - apertura.current - attuali[0].dallApertura)
          : undefined,
      },
      ...attuali,
    ]);
    return (await risolviCodice(db, codice)) ? 'trovato' : 'sconosciuto';
  }, []);

  return (
    <Scanner titolo="Prova scanner" onCodice={onCodice} onChiudi={() => void naviga('/')}>
      <div className="max-h-[35dvh] overflow-auto border-t border-grafite px-4 py-2 text-sm">
        <p data-test="rilevatore">Rilevatore: {rilevatore}</p>
        <table
          className="mt-1 w-full tabular-nums whitespace-nowrap [&_td]:py-0.5 [&_td]:pr-3 [&_th]:pr-3"
          data-test="letture"
        >
          <thead>
            <tr className="text-left">
              <th>#</th>
              <th>Codice</th>
              <th>Sorgente</th>
              <th>Ora</th>
              <th className="text-right">Da apertura</th>
              <th className="text-right">Da prec.</th>
              <th>Esito</th>
            </tr>
          </thead>
          <tbody>
            {letture.map((l) => (
              <tr key={l.numero}>
                <td>{l.numero}</td>
                <td className="font-mono">{l.codice}</td>
                <td>{l.sorgente}</td>
                <td>{ora.format(l.ora)}</td>
                <td className="text-right">{l.dallApertura} ms</td>
                <td className="text-right">
                  {l.dallaPrecedente === undefined ? '—' : `${l.dallaPrecedente} ms`}
                </td>
                <td>
                  <Esito codice={l.codice} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Scanner>
  );
}
