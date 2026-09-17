import type { TipoSessione } from '@terminalinobru/core';
import { formattaNumero } from '../formato.js';
import type { Riepilogo as DatiRiepilogo } from '../sessioni/riepilogo.js';

function Differenza({ valore }: { valore: number | undefined }) {
  if (valore === undefined) {
    return <span className="etichetta">giacenza non nota</span>;
  }
  if (valore === 0) {
    return (
      <span className="rounded-full border border-verde bg-verde/15 px-2 text-sm font-semibold">
        = giacenza
      </span>
    );
  }
  return (
    <span className="rounded-full border border-arancio bg-arancio/15 px-2 text-sm font-semibold tabular-nums">
      {valore > 0 ? '+' : '−'}
      {formattaNumero(Math.abs(valore))}
    </span>
  );
}

/** Righe aggregate per prodotto, con totali e, per l'inventario, le differenze dalla giacenza. */
export function Riepilogo({ tipo, riepilogo }: { tipo: TipoSessione; riepilogo: DatiRiepilogo }) {
  const inventario = tipo === 'inventario';
  return (
    <section className="flex flex-col gap-3" aria-label="Riepilogo">
      <div className="card grid grid-cols-3 divide-x divide-grigio-bordo text-center">
        <p className="p-3">
          <span className="block text-2xl font-bold tabular-nums">
            {formattaNumero(riepilogo.voci.length)}
          </span>
          <span className="etichetta">prodotti</span>
        </p>
        <p className="p-3">
          <span className="block text-2xl font-bold tabular-nums">
            {formattaNumero(riepilogo.totaleRighe)}
          </span>
          <span className="etichetta">righe</span>
        </p>
        <p className="p-3">
          <span className="block text-2xl font-bold tabular-nums">
            {formattaNumero(riepilogo.totalePezzi)}
          </span>
          <span className="etichetta">pezzi</span>
        </p>
      </div>
      {inventario && (
        <p
          className={`rounded-xl border p-3 font-semibold ${
            riepilogo.vociConDifferenza > 0
              ? 'border-arancio bg-arancio/15'
              : 'border-verde bg-verde/15'
          }`}
        >
          {riepilogo.vociConDifferenza === 0
            ? 'Nessuna differenza rispetto alla giacenza teorica.'
            : `${riepilogo.vociConDifferenza} ${
                riepilogo.vociConDifferenza === 1 ? 'prodotto diverso' : 'prodotti diversi'
              } dalla giacenza teorica.`}
          {riepilogo.vociSenzaGiacenza > 0 &&
            ` ${riepilogo.vociSenzaGiacenza} senza giacenza nel catalogo.`}
        </p>
      )}
      {riepilogo.voci.length > 0 && (
        <ul className="card divide-y divide-grigio-bordo">
          {riepilogo.voci.map((voce) => (
            <li key={voce.codice} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-titolo font-bold break-all">{voce.codice}</p>
                <p className="text-base">{voce.descrizione ?? 'Prodotto non più in catalogo'}</p>
                <p className="etichetta flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span>
                    {voce.righe} {voce.righe === 1 ? 'riga' : 'righe'}
                  </span>
                  {inventario && voce.giacenza !== undefined && (
                    <span>teorica {formattaNumero(voce.giacenza)}</span>
                  )}
                  {inventario && <Differenza valore={voce.differenza} />}
                </p>
              </div>
              <p className="shrink-0 text-2xl font-bold tabular-nums">
                {formattaNumero(voce.quantita)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
