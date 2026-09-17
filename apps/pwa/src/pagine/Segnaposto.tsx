import { useParams } from 'react-router';
import { Pagina } from '../componenti/Pagina.js';

/** Schermata della sessione: la implementa T07. */
export function Sessione() {
  const { id } = useParams();
  return (
    <Pagina titolo="Sessione" indietro="/">
      <div className="card p-4">
        <p className="font-semibold">Le sessioni di lavoro arrivano a breve.</p>
        <p className="etichetta mt-1 break-all">Sessione {id}</p>
      </div>
    </Pagina>
  );
}

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
