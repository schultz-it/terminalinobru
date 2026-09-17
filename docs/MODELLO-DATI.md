# Modello dati

Nomi in italiano, snake_case nel database, camelCase in TypeScript. Le date sono stringhe ISO 8601
in UTC. Gli identificativi delle sessioni e delle righe sono UUID v4 generati sul telefono, perché
nascono offline.

## 1. Tipi di dominio (`packages/core`)

```ts
type Prodotto = {
  codice: string;              // chiave, codice Easyfatt
  descrizione: string;
  categoria?: string;
  sottocategoria?: string;
  um?: string;
  prezziNetti: (number | null)[]; // indice 0 = listino 1 ... fino a 9, null se assente
  prezziLordi: (number | null)[]; // null e non NaN: sopravvive a JSON, D1 e zod
  ivaPerc?: number;
  gestioneMagazzino: boolean;
  ubicazione?: string;
  scortaMinima?: number;
  giacenza?: number;           // AvailableQty al momento del push
  ordinato?: number;
  fornitore?: string;
  codiceFornitore?: string;
  note?: string;
  aggiornatoIl: string;
  eliminatoIl?: string;        // tombstone
};

type Barcode = {
  barcode: string;             // chiave
  codiceProdotto: string;
  origine: 'easyfatt' | 'app';
  quantitaConfezione?: number; // PackageQty, conservato ma non usato
  aggiornatoIl: string;
};

type TipoSessione = 'inventario' | 'ddt' | 'carico';
type StatoSessione = 'aperta' | 'chiusa' | 'esportata' | 'importata';
type ModalitaScansione = 'chiedi_quantita' | 'somma_uno';

type Sessione = {
  id: string;
  tipo: TipoSessione;
  nome: string;
  note?: string;
  stato: StatoSessione;
  modalita: ModalitaScansione;
  creataIl: string;
  chiusaIl?: string;
  dispositivo?: string;        // etichetta del telefono, da impostazioni
  cliente?: ClienteDocumento;  // v2, solo ddt: copia completa del cliente scelto o creato sul telefono
  numeroDocumento?: number;    // v2, solo ddt: assegnato dal bridge alla ricezione
  righe?: Riga[];
};

// v2. I campi del cliente che finiscono nel documento (tag Customer* di Easyfatt-XML).
type ClienteDocumento = {
  codice?: string;             // CustomerCode: assente per i clienti creati in app (lo assegna Easyfatt)
  nome: string;                // CustomerName, obbligatorio
  partitaIva?: string;         // CustomerVatCode
  codiceFiscale?: string;      // CustomerFiscalCode
  indirizzo?: string;          // CustomerAddress
  cap?: string;                // CustomerPostcode
  citta?: string;              // CustomerCity
  provincia?: string;          // CustomerProvince, 2 lettere
  nazione?: string;            // CustomerCountry
  sdi?: string;                // CustomerEInvoiceDestCode (codice destinatario o PEC)
  telefono?: string;           // CustomerTel
  email?: string;              // CustomerEmail
};

// v2. Anagrafica sul telefono: dall'export di Easyfatt oppure creata in app.
type Cliente = ClienteDocumento & {
  id: string;                  // chiave: il codice Easyfatt, oppure un UUID per quelli creati in app
  origine: 'easyfatt' | 'app';
  listino?: number;            // 1..9 se ricavabile dall'export
  aggiornatoIl: string;
  eliminatoIl?: string;
};

type Riga = {
  id: string;
  sessioneId: string;
  codiceProdotto: string;
  quantita: number;
  barcodeLetto?: string;
  lettaIl: string;
  ordine: number;              // progressivo nella sessione
};

type Impostazioni = {
  urlBridge: string;
  token: string;
  stringaFormato: string;      // default 'A,Q'
  separatoreDecimale: '.' | ',';
  listinoMostrato: number;     // 1..9
  modalitaPredefinita: ModalitaScansione;
  suoni: boolean;
  vibrazione: boolean;
  dispositivo: string;
  ultimaSincronizzazione?: string;
};
```

Funzioni pure in `core`:

- `aggregaRighe(righe): {codice, quantita}[]` somma per prodotto, ordine di prima comparsa.
- `normalizza(testo)`: minuscolo, senza accenti, spazi compressi.
- `cercaProdotti(indice, query, limite)`: token AND su codice e descrizione, prefisso di codice prima.
- `transizioneStato(da, a)`: valida `aperta → chiusa → esportata → importata`; `chiusa → aperta` ammessa per riaprire sul telefono, `esportata → chiusa` per rifare l'export dal bridge.
- `rilevaInputLettore(eventi)`: raffica di tasti sotto soglia di tempo terminata da Invio.

## 2. Schema D1 (`apps/bridge/migrations`)

```sql
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
  importata_il TEXT,
  cliente TEXT,                   -- v2 (migrazione 0002): JSON di ClienteDocumento
  numero_documento INTEGER        -- v2: progressivo per tenant, assegnato alla ricezione dei ddt
);
CREATE INDEX sessione_tenant_stato ON sessione(tenant_id, stato, chiusa_il);
CREATE UNIQUE INDEX sessione_numero ON sessione(tenant_id, numero_documento);  -- v2

-- v2 (migrazione 0002): tenant.prossimo_numero_documento INTEGER NOT NULL DEFAULT 1
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
```

Il bridge conserva solo sessioni chiuse: le sessioni aperte vivono sul telefono.
Un `POST /api/sessioni` con `id` già presente sostituisce le righe (l'utente ha riaperto e richiuso).

## 3. Store Dexie (`apps/pwa`)

| Store | Chiave | Indici | Note |
| --- | --- | --- | --- |
| `prodotti` | `codice` | `aggiornatoIl` | Specchio del catalogo, senza tombstone (eliminati rimossi). |
| `barcode` | `barcode` | `codiceProdotto` | Include abbinamenti locali con `origine: 'app'`. |
| `sessioni` | `id` | `stato`, `creataIl` | Tutte le sessioni, anche chiuse, finché non si fa pulizia. Campi solo locali: `inviataIl` (il bridge ha accettato l'invio) e, per i DDT, `numeroDocumento` letto dalla risposta del bridge o dall'allineamento (v2). |
| `righe` | `id` | `sessioneId`, `[sessioneId+ordine]` | |
| `codaUpload` | `++id` | `tipo` | Sessioni e barcode da inviare al bridge quando torna la rete. Voce: `{ tipo, riferimento, creataIl, tentativi, ultimoErrore? }`; `riferimento` è l'id della sessione o il barcode abbinato (una voce per barcode, il corpo si legge dallo store `barcode` al momento dell'invio). |
| `clienti` | `id` | `origine`, `partitaIva`, `codiceFiscale` | v2. Export di Easyfatt (`origine: 'easyfatt'`, senza tombstone) più i clienti creati in app (`origine: 'app'`). Al primo export che porta la stessa partita IVA o lo stesso codice fiscale, la voce creata in app viene sostituita. |
| `impostazioni` | `chiave` | | Coppie chiave/valore: i campi di `Impostazioni` più `cursoreCatalogo` e `cursoreClienti`, l'`aggiornatoIl` dell'ultima risposta di `/api/catalogo` e di `/api/clienti` (v2). |

## 4. Forme JSON dell'API

`GET /api/stato`

```json
{ "nome": "Imballaggi Brunelli", "ultimoCatalogoIl": "2026-09-16T12:34:56Z", "prodotti": 1234 }
```

`ultimoCatalogoIl` è `null` finché Easyfatt non ha mai inviato il catalogo.

`GET /api/catalogo?dal=2026-09-16T10:00:00Z`

```json
{
  "aggiornatoIl": "2026-09-16T12:34:56Z",
  "prodotti": [ { "codice": "...", "descrizione": "...", "...": "..." } ],
  "barcode": [ { "barcode": "...", "codiceProdotto": "...", "origine": "easyfatt" } ],
  "prodottiEliminati": ["CODICE1"],
  "barcodeEliminati": ["123"]
}
```

`aggiornatoIl` è il cursore: la PWA lo salva e lo rispedisce tale e quale come `dal` alla chiamata
successiva. È la data dell'ultimo invio riuscito del catalogo, non l'orologio del bridge né quello del
telefono (vedi `DECISIONI.md` punto 26). Senza `dal` la risposta è il catalogo completo.

`POST /api/sessioni`: corpo `Sessione` con `righe` incluse e `stato: "chiusa"`. Risposta `201`
con `{ "id": "...", "ricevutaIl": "...", "numeroDocumento": 12 }` (v2: `numeroDocumento` solo per
i `ddt`, assegnato alla prima ricezione e mai cambiato). Stessa forma per `GET /api/sessioni/:id`.

v2: `GET /api/clienti?dal=ISO` risponde `{ "aggiornatoIl": "...", "clienti": [...], "clientiEliminati": ["C001"] }`
con lo stesso cursore del catalogo (`tenant.ultimo_clienti_il`). `POST /api/clienti/importa` riceve
`{ "clienti": Cliente[] }` (JSON, già interpretato dalla PWA) e risponde `{ "importati": 120, "eliminati": 3 }`.

`PATCH /api/sessioni/:id`: `{ "stato": "esportata" }`. Risposta `200` con la sessione aggiornata,
`409` se la transizione non è ammessa.

`POST /api/barcode`: `[{ "barcode": "...", "codiceProdotto": "..." }]`. Risposta `204`.

Errori: `{ "errore": "messaggio leggibile" }` con codice HTTP appropriato. Le risposte destinate a
Easyfatt (`/easyfatt/*`) sono testo puro, mai JSON.
