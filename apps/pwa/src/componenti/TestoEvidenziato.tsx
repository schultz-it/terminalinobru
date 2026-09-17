import { segmentiEvidenziati } from '../ricerca/evidenzia.js';

/** Testo con le parti che corrispondono alla ricerca su fondo giallo chiaro. */
export function TestoEvidenziato({ testo, query }: { testo: string; query: string }) {
  return (
    <>
      {segmentiEvidenziati(testo, query).map((segmento, i) =>
        segmento.evidenziato ? (
          <mark key={i} className="rounded-sm bg-giallo-chiaro text-nero">
            {segmento.testo}
          </mark>
        ) : (
          <span key={i}>{segmento.testo}</span>
        ),
      )}
    </>
  );
}
