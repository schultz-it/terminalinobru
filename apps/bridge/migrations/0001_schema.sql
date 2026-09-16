-- Schema iniziale del bridge. Vedi docs/MODELLO-DATI.md sezione 2.
-- Ogni tabella porta `tenant_id`: in v1 esiste un solo tenant, ma lo schema è già multi-tenant.

CREATE TABLE tenant (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  easyfatt_utente TEXT NOT NULL UNIQUE,
  easyfatt_password_hash TEXT NOT NULL,
  token_app_hash TEXT NOT NULL,
  stringa_formato TEXT NOT NULL DEFAULT 'A,Q',
  separatore_decimale TEXT NOT NULL DEFAULT '.',
  ultimo_catalogo_il TEXT,
  creato_il TEXT NOT NULL
);

CREATE TABLE prodotto (
  tenant_id TEXT NOT NULL REFERENCES tenant(id),
  codice TEXT NOT NULL,
  descrizione TEXT NOT NULL,
  categoria TEXT, sottocategoria TEXT, um TEXT,
  prezzi_netti TEXT NOT NULL,     -- JSON array
  prezzi_lordi TEXT NOT NULL,     -- JSON array
  iva_perc REAL,
  gestione_magazzino INTEGER NOT NULL DEFAULT 1,
  ubicazione TEXT, scorta_minima REAL, giacenza REAL, ordinato REAL,
  fornitore TEXT, codice_fornitore TEXT, note TEXT,
  aggiornato_il TEXT NOT NULL,
  eliminato_il TEXT,
  PRIMARY KEY (tenant_id, codice)
);
CREATE INDEX prodotto_aggiornato ON prodotto(tenant_id, aggiornato_il);

CREATE TABLE barcode (
  tenant_id TEXT NOT NULL REFERENCES tenant(id),
  barcode TEXT NOT NULL,
  codice_prodotto TEXT NOT NULL,
  origine TEXT NOT NULL CHECK (origine IN ('easyfatt','app')),
  quantita_confezione REAL,
  aggiornato_il TEXT NOT NULL,
  eliminato_il TEXT,
  PRIMARY KEY (tenant_id, barcode)
);
CREATE INDEX barcode_aggiornato ON barcode(tenant_id, aggiornato_il);

CREATE TABLE sessione (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenant(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('inventario','ddt','carico')),
  nome TEXT NOT NULL,
  note TEXT,
  stato TEXT NOT NULL CHECK (stato IN ('chiusa','esportata','importata')),
  modalita TEXT NOT NULL,
  dispositivo TEXT,
  creata_il TEXT NOT NULL,
  chiusa_il TEXT NOT NULL,
  ricevuta_il TEXT NOT NULL,
  esportata_il TEXT,
  importata_il TEXT
);
CREATE INDEX sessione_tenant_stato ON sessione(tenant_id, stato, chiusa_il);

CREATE TABLE riga (
  id TEXT PRIMARY KEY,
  sessione_id TEXT NOT NULL REFERENCES sessione(id) ON DELETE CASCADE,
  codice_prodotto TEXT NOT NULL,
  quantita REAL NOT NULL,
  barcode_letto TEXT,
  letta_il TEXT NOT NULL,
  ordine INTEGER NOT NULL
);
CREATE INDEX riga_sessione ON riga(sessione_id, ordine);
