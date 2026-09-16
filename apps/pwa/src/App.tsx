import { useEffect, useState } from 'react';
import { descriviEsito, verificaSalute, type EsitoSalute } from './salute.js';

export function App() {
  const [esito, setEsito] = useState<EsitoSalute>({ stato: 'in-corso' });

  useEffect(() => {
    let annullato = false;
    void verificaSalute().then((risultato) => {
      if (!annullato) setEsito(risultato);
    });
    return () => {
      annullato = true;
    };
  }, []);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-slate-50 p-6 text-slate-900">
      <h1 className="text-3xl font-bold tracking-tight">TerminalinoBru</h1>
      <p data-test="esito-salute" className="text-base text-slate-600">
        {descriviEsito(esito)}
      </p>
    </main>
  );
}
