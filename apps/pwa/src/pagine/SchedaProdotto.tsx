import { ScanBarcode } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { Pagina } from '../componenti/Pagina.js';
import { db } from '../db.js';
import { formattaDataOra, formattaNumero, formattaPrezzo } from '../formato.js';
import { useImpostazioni } from '../hooks/useImpostazioni.js';
import { useLiveQuery } from '../hooks/useLiveQuery.js';

function Voce({ etichetta, children }: { etichetta: string; children: ReactNode }) {
  return (
    <div className="flex min-h-12 items-baseline justify-between gap-4 py-2">
      <dt className="etichetta shrink-0">{etichetta}</dt>
      <dd className="text-right font-semibold break-words">{children}</dd>
    </div>
  );
}

export function SchedaProdotto() {
  const { codice = '' } = useParams();
  const { impostazioni } = useImpostazioni();
  // `null` distingue "prodotto non trovato" da "lettura in corso" (undefined).
  const prodotto = useLiveQuery(async () => (await db.prodotti.get(codice)) ?? null, [codice]);
  const barcode = useLiveQuery(
    () => db.barcode.where('codiceProdotto').equals(codice).sortBy('barcode'),
    [codice],
  );
  const listino = impostazioni?.listinoMostrato ?? 1;

  return (
    <Pagina
      titolo="Scheda prodotto"
      indietro="/consulta"
      azione={
        // Punto di aggancio per T06: scansione di un altro prodotto direttamente dalla scheda.
        <button
          type="button"
          disabled
          aria-label="Scansiona (disponibile a breve)"
          className="flex size-12 items-center justify-center rounded-full opacity-50"
        >
          <ScanBarcode size={28} strokeWidth={2} />
        </button>
      }
    >
      {prodotto === null && (
        <div className="card p-4">
          <p className="font-semibold">
            Prodotto «{codice}» non presente nel catalogo del telefono.
          </p>
          <Link to="/consulta" className="pulsante-secondario mt-4 w-full">
            Torna alla ricerca
          </Link>
        </div>
      )}
      {prodotto && (
        <>
          <section className="card p-4">
            <p className="font-titolo text-xl font-bold break-all">{prodotto.codice}</p>
            <p className="mt-1 text-lg">{prodotto.descrizione}</p>
            {prodotto.categoria && (
              <p className="etichetta mt-2">
                {prodotto.categoria}
                {prodotto.sottocategoria ? ` › ${prodotto.sottocategoria}` : ''}
              </p>
            )}
          </section>

          <section className="card p-4">
            <h2 className="text-base uppercase tracking-wide">Prezzo listino {listino}</h2>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <div>
                <p className="etichetta">Netto</p>
                <p className="text-2xl font-bold tabular-nums">
                  {formattaPrezzo(prodotto.prezziNetti[listino - 1])}
                </p>
              </div>
              <div>
                <p className="etichetta">
                  Lordo
                  {prodotto.ivaPerc !== undefined
                    ? ` (IVA ${formattaNumero(prodotto.ivaPerc)}%)`
                    : ''}
                </p>
                <p className="text-2xl font-bold tabular-nums">
                  {formattaPrezzo(prodotto.prezziLordi[listino - 1])}
                </p>
              </div>
            </div>
          </section>

          <section className="card p-4">
            <h2 className="text-base uppercase tracking-wide">Magazzino</h2>
            <div className="mt-3">
              <p className="etichetta">Giacenza{prodotto.um ? ` (${prodotto.um})` : ''}</p>
              <p className="text-4xl font-bold tabular-nums">{formattaNumero(prodotto.giacenza)}</p>
              <p className="etichetta">aggiornata il {formattaDataOra(prodotto.aggiornatoIl)}</p>
            </div>
            <dl className="mt-3 divide-y divide-grigio-bordo tabular-nums">
              <Voce etichetta="Ordinato">{formattaNumero(prodotto.ordinato)}</Voce>
              <Voce etichetta="Scorta minima">{formattaNumero(prodotto.scortaMinima)}</Voce>
              <Voce etichetta="Ubicazione">{prodotto.ubicazione || '—'}</Voce>
              <Voce etichetta="Categoria">{prodotto.categoria || '—'}</Voce>
            </dl>
          </section>

          <section className="card p-4">
            <h2 className="text-base uppercase tracking-wide">Barcode associati</h2>
            {barcode && barcode.length > 0 ? (
              <ul className="mt-2 divide-y divide-grigio-bordo">
                {barcode.map((b) => (
                  <li
                    key={b.barcode}
                    className="flex min-h-12 items-center justify-between gap-2 py-2"
                  >
                    <span className="font-mono text-base break-all">{b.barcode}</span>
                    {b.origine === 'app' && (
                      <span className="rounded-full bg-giallo-chiaro px-2 py-0.5 text-sm text-grafite">
                        abbinato in app
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="etichetta mt-2">Nessun barcode associato.</p>
            )}
          </section>

          {prodotto.note && (
            <section className="card p-4">
              <h2 className="text-base uppercase tracking-wide">Note</h2>
              <p className="mt-2 whitespace-pre-line">{prodotto.note}</p>
            </section>
          )}
        </>
      )}
    </Pagina>
  );
}
