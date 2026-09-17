import { Pagina } from '../componenti/Pagina.js';

/** Elenco delle sessioni da esportare verso Easyfatt: lo implementa T08. */
export function Esportazioni() {
  return (
    <Pagina titolo="Esportazioni">
      <div className="card p-4">
        <p className="font-semibold">Le esportazioni per Easyfatt arrivano a breve.</p>
        <p className="etichetta mt-1">
          Qui scaricherai il file del terminalino delle sessioni chiuse.
        </p>
      </div>
    </Pagina>
  );
}
