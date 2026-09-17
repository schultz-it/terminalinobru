import type { ClienteDocumento } from '@terminalinobru/core';

/** Il cliente di un DDT in breve: nome, codice (o "nuovo") e dati fiscali. */
export function SchedaCliente({ cliente }: { cliente: ClienteDocumento }) {
  const localita = [cliente.cap, cliente.citta, cliente.provincia && `(${cliente.provincia})`]
    .filter(Boolean)
    .join(' ');
  return (
    <div className="min-w-0">
      <p className="font-bold break-words">{cliente.nome}</p>
      <p className="etichetta">
        {cliente.codice ? `Cod. ${cliente.codice}` : 'Nuovo: lo crea Easyfatt'}
        {cliente.partitaIva && ` · P.IVA ${cliente.partitaIva}`}
        {!cliente.partitaIva && cliente.codiceFiscale && ` · C.F. ${cliente.codiceFiscale}`}
      </p>
      {(cliente.indirizzo || localita) && (
        <p className="etichetta break-words">
          {[cliente.indirizzo, localita].filter(Boolean).join(', ')}
        </p>
      )}
    </div>
  );
}
