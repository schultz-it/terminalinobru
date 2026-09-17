-- v2: clienti, numerazione dei DDT e ricezione documenti. Vedi docs/MODELLO-DATI.md sezione 2 e
-- docs/DECISIONI.md punti 52-53. In produzione si applica dal PC (docs/RUNBOOK.md sezione 4).

ALTER TABLE tenant ADD COLUMN prossimo_numero_documento INTEGER NOT NULL DEFAULT 1;
ALTER TABLE tenant ADD COLUMN ultimo_clienti_il TEXT;

ALTER TABLE sessione ADD COLUMN cliente TEXT;
ALTER TABLE sessione ADD COLUMN numero_documento INTEGER;

CREATE TABLE cliente (                   -- solo l'export di Easyfatt; quelli creati in app vivono sul telefono
  tenant_id TEXT NOT NULL REFERENCES tenant(id),
  codice TEXT NOT NULL,
  nome TEXT NOT NULL,
  partita_iva TEXT, codice_fiscale TEXT, indirizzo TEXT, cap TEXT, citta TEXT, provincia TEXT,
  nazione TEXT, sdi TEXT, telefono TEXT, email TEXT, listino INTEGER,
  aggiornato_il TEXT NOT NULL,
  eliminato_il TEXT,
  PRIMARY KEY (tenant_id, codice)
);
CREATE INDEX cliente_aggiornato ON cliente(tenant_id, aggiornato_il);

-- Assegna il numero alle sessioni ddt già presenti, in ordine di ricevuta_il per tenant: la
-- posizione (1-based) fra le ddt dello stesso tenant, a parità di ricevuta_il si spareggia per id
-- così il numero resta stabile anche se due sessioni condividono lo stesso istante.
UPDATE sessione
SET numero_documento = (
  SELECT COUNT(*) FROM sessione AS s2
  WHERE s2.tenant_id = sessione.tenant_id
    AND s2.tipo = 'ddt'
    AND (
      s2.ricevuta_il < sessione.ricevuta_il
      OR (s2.ricevuta_il = sessione.ricevuta_il AND s2.id <= sessione.id)
    )
)
WHERE tipo = 'ddt';

-- Porta il contatore di ogni tenant oltre l'ultimo numero assegnato (1 se non ha ddt).
UPDATE tenant
SET prossimo_numero_documento = (
  SELECT COALESCE(MAX(numero_documento), 0) + 1
  FROM sessione
  WHERE sessione.tenant_id = tenant.id AND sessione.tipo = 'ddt'
);

-- I NULL di numero_documento (inventario, carico) non collidono nell'indice unico: SQLite
-- considera ogni NULL distinto dagli altri.
CREATE UNIQUE INDEX sessione_numero ON sessione(tenant_id, numero_documento);
