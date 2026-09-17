# Architettura

Ultimo aggiornamento: 2026-09-16. Le scelte qui descritte sono motivate in `DECISIONI.md`.

## 1. Obiettivo

Sostituire un terminalino barcode hardware con un telefono Android, restando dentro ciò che
Easyfatt supporta ufficialmente. L'app non scrive mai direttamente nell'archivio Easyfatt:
produce file e documenti nei formati che Easyfatt importa da solo, e riceve il catalogo che
Easyfatt spedisce da solo. Questo vincolo è deliberato: nessuna dipendenza da API non documentate,
nessun rischio di corrompere l'archivio, e il prodotto resta vendibile a qualsiasi utente Easyfatt.

## 2. Componenti

```
 ┌──────────────────────┐   push catalogo (HTTP POST multipart, Basic auth)
 │  Easyfatt Enterprise │ ───────────────────────────────────────────────┐
 │  (PC Windows)        │ ◄── polling documenti (HTTP GET, v2) ──┐        │
 │                      │                                        │        ▼
 │  Importa da terminale│ ◄── file terminale.txt scaricato ──┐   │  ┌──────────────────┐
 └──────────────────────┘        dal browser del PC          │   └─ │  BRIDGE          │
                                                             │      │  Cloudflare      │
 ┌──────────────────────┐                                    │      │  Worker + D1     │
 │  PWA su Android      │ ── sync catalogo (JSON, Bearer) ───┼────► │                  │
 │  (offline-first)     │ ── upload sessioni chiuse ─────────┼────► │  serve anche la  │
 │  scanner fotocamera  │                                    │      │  PWA statica     │
 │  o lettore BT        │                                    └───── │                  │
 └──────────────────────┘                                           └──────────────────┘
```

### 2.1 `packages/easyfatt` — protocolli Danea

Libreria pura, senza I/O, testata al 100%. È il cuore vendibile del progetto.

- `analizzaCatalogo(xml)`: da `EasyfattProducts` (protocollo 2 e 3, modalità `full` e `incremental`) a prodotti, barcode aggiuntivi, codici eliminati.
- `generaFileTerminale(righe, formato)`: da righe aggregate `{codice, quantita, lotto?, scadenza?}` al testo del file, rispettando la stringa formato di Easyfatt (campi delimitati o a spaziatura fissa, caratteri `A Q q L S X`).
- `analizzaStringaFormato(stringa)`: valida e interpreta la stringa formato, per mostrare errori in app.
- `generaDocumentiXml(documenti)` (v2): da documenti di dominio a `EasyfattDocuments` (ordini cliente `C` con cliente, numero e righe aggregate).
- `analizzaParametriRicezione(query)` (v2): interpreta `appver`, `firstdate`, `lastdate`, `firstnum`, `lastnum` del polling.
- `analizzaClientiTabella(righe)` e `leggiCsv(testo)` (v2): dall'export clienti "Soggetti" di Easyfatt (Excel letto nel browser, o CSV) ai clienti di dominio, con abbinamento delle colonne per nome.

Dettagli dei formati in `PROTOCOLLI-DANEA.md`.

### 2.2 `packages/core` — dominio

Tipi (`Prodotto`, `Barcode`, `Sessione`, `Riga`, `Impostazioni`), schemi zod, funzioni pure:
aggregazione righe per prodotto, normalizzazione stringhe per la ricerca, transizioni di stato
delle sessioni, riconoscimento input da lettore tastiera. Vedi `MODELLO-DATI.md`.

### 2.3 `apps/bridge` — Cloudflare Worker

Hono + D1. Un solo Worker che espone:

| Metodo | Percorso | Auth | Scopo |
| --- | --- | --- | --- |
| POST | `/easyfatt/catalogo` | Basic (utente e password del tenant) | Riceve `EasyfattProducts` da Easyfatt, campo multipart `file`. Risponde `OK` in testo puro. Qualsiasi altro corpo Easyfatt lo mostra come errore. |
| GET | `/easyfatt/documenti` | Basic | Polling ordini di Easyfatt. In v2 serve le sessioni DDT chiuse come ordini cliente `C`, filtrate con `firstnum`/`lastnum`/`firstdate`/`lastdate`; la prima consegna segna `esportata`. |
| GET | `/api/stato` | Bearer | Nome tenant, data ultimo catalogo, numero prodotti. Usato dalla schermata Impostazioni. |
| GET | `/api/catalogo?dal=ISO` | Bearer | Prodotti e barcode modificati dopo `dal`, più codici eliminati. Senza `dal` restituisce tutto. |
| POST | `/api/sessioni` | Bearer | Upsert di una sessione chiusa con le righe. Idempotente sull'`id` generato dal telefono. |
| GET | `/api/sessioni?stato=` | Bearer | Elenco sessioni. |
| GET | `/api/sessioni/:id` | Bearer | Dettaglio con righe. |
| GET | `/api/sessioni/:id/terminale.txt` | Bearer | File terminalino generato al volo con la stringa formato del tenant. |
| PATCH | `/api/sessioni/:id` | Bearer | Cambio stato: `chiusa → esportata → importata`, oppure `esportata → chiusa` per rifare l'export. |
| POST | `/api/barcode` | Bearer | Abbinamenti barcode → prodotto creati in app (origine `app`). |
| GET | `/api/barcode/nuovi.csv` | Bearer | Abbinamenti creati in app, da riportare in Easyfatt. |
| POST | `/api/clienti/importa` | Bearer | (v2) Riceve i clienti già interpretati dalla PWA dall'export Excel di Easyfatt; sostituisce l'elenco (tombstone per gli assenti). |
| GET | `/api/clienti?dal=ISO` | Bearer | (v2) Clienti modificati dopo `dal`, più i codici eliminati; senza `dal` tutti. |

Gli asset della PWA (`apps/pwa/dist`) sono serviti dallo stesso Worker tramite binding `assets`,
con fallback single-page. Percorsi `/api/*` e `/easyfatt/*` passano sempre dal Worker.

Regole:

- Ogni tabella ha `tenant_id`. In v1 esiste un solo tenant, creato con lo script `pnpm --filter bridge tenant:crea`, che genera le credenziali e salva solo gli hash. Nessuna UI di gestione tenant.
- Le credenziali sono salvate come hash SHA-256; confronto a tempo costante.
- L'upsert del catalogo lavora a blocchi con `db.batch` (D1 limita il numero di statement per chiamata). Un catalogo `full` marca come eliminati i prodotti assenti (tombstone `eliminato_il`), non li cancella.
- Il bridge non contiene logica di dominio: valida, persiste, genera file. La logica sta in `packages/core` ed `easyfatt`.

### 2.4 `apps/pwa` — l'app

Vite + React + TypeScript + Tailwind. Installabile su Android da Chrome. Offline-first:

- **Dexie** tiene catalogo, barcode, sessioni, righe e impostazioni in IndexedDB. Tutto funziona senza rete; il bridge serve solo a sincronizzare.
- **Sync catalogo** manuale dalla schermata Impostazioni e automatica all'avvio se online e passate più di 6 ore. Delta tramite `dal`. In v2 la stessa sync scarica anche i clienti (`/api/clienti`).
- **Upload sessioni** quando l'utente chiude una sessione; se offline resta in coda e riprova alla prossima apertura e al ritorno della rete.
- **Stato delle sessioni**: `esportata` e `importata` li decide il bridge (dal PC). La PWA li legge da `GET /api/sessioni` dopo ogni giro della coda e aprendo Esportazioni, e aggiorna in sola lettura le sessioni locali non aperte e senza invio in coda.
- **Ricerca** in memoria su indice costruito dai prodotti in Dexie: normalizzazione senza accenti e maiuscole, match per token su codice e descrizione, priorità ai prefissi di codice. Il catalogo atteso è di poche migliaia di righe, non serve un motore esterno.
- **Scanner**: componente unico che accetta input da tre sorgenti e le espone tramite `onCodice(codice, sorgente)`; chi riceve restituisce l'esito (`trovato`, `sconosciuto`, `ignorato`) e lo scanner sceglie il feedback:
  1. fotocamera tramite `BarcodeDetector`, con polyfill `barcode-detector` dove l'API nativa manca;
  2. lettore Bluetooth o USB in modalità tastiera: listener sul documento, attivo mentre lo scanner è montato, che riconosce raffiche di tasti terminate da Invio;
  3. digitazione manuale del codice.
  Ogni lettura dà feedback sonoro e vibrazione, con suono diverso per codice sconosciuto.
- **Schermate**: Home (sessioni aperte, nuova sessione, consultazione), Sessione (scanner, riga corrente, elenco righe, chiudi), Consultazione (scanner + ricerca, scheda prodotto con prezzi, giacenza, ubicazione), Esportazioni (elenco sessioni chiuse con download del file e cambio stato, pensata per il browser del PC), Impostazioni (URL bridge, token, stringa formato, listino da mostrare, modalità scansione predefinita, suoni).
- **Setup rapido**: le impostazioni di connessione si possono caricare scansionando un QR generato dal bridge.

## 3. Flussi

### 3.1 Catalogo: da Easyfatt al telefono

1. In Easyfatt, Opzioni > Moduli > E-commerce: terzo sito, tipo personalizzato, URL aggiornamento prodotti `https://<bridge>/easyfatt/catalogo`, login e password del tenant.
2. L'utente lancia "Aggiorna prodotti e-commerce". Easyfatt fa POST del file XML. Il bridge risponde `OK`.
3. Sul telefono, Impostazioni > Sincronizza, oppure automatico. La PWA scarica il delta e aggiorna Dexie.

Il catalogo porta codice, descrizione, barcode principale e aggiuntivi, listini, giacenza, ordinato,
scorta minima, ubicazione. La giacenza è quella al momento del push: in app si mostra sempre
"aggiornata il ...".

### 3.2 Inventario

1. Nuova sessione di tipo inventario, nome libero (es. "Scaffale A").
2. Scansione o ricerca, quindi digitazione della quantità rilevata. Accanto si vede la giacenza teorica.
3. Chiudi sessione: upload al bridge, stato `chiusa`.
4. Sul PC, apri l'app nel browser, Esportazioni, scarica `terminale.txt`. Stato `esportata`.
5. In Easyfatt: Magazzino > Movimenti > Rettifica > Rettifica manuale > Importa da terminale portatile. Causale predefinita "Rettifica giacenza". Se l'inventario è completo, "Azzera giacenza dei prodotti non in elenco". Conferma.
6. In app, segna la sessione come `importata`.

Se lo stesso prodotto compare più volte nella sessione, l'export somma le quantità in una riga sola.

### 3.3 DDT (v2: ordine e-commerce)

1. Nuova sessione di tipo `ddt` con **scelta del cliente** sul telefono (ricerca per nome, codice
   o partita IVA nell'elenco clienti sincronizzato dal bridge).
2. Scansione e quantità come per l'inventario. Chiudi sessione: upload al bridge, che assegna un
   **numero documento progressivo** per tenant.
3. In Easyfatt: **Strumenti > Scarica ordini da e-Commerce**. Easyfatt chiede al bridge i
   documenti dall'ultimo numero non importato; il bridge risponde con gli ordini cliente (`C`)
   delle sessioni DDT, righe aggregate con codice e quantità. La prima consegna segna la sessione
   `esportata`; quando Easyfatt la riceve di nuovo passa a `importata` (Easyfatt chiede sempre
   dal numero 1 e deduplica da solo: `DECISIONI.md` punto 68).
4. In Easyfatt l'ordine cliente si trasforma in DDT con "Genera da": lo scarico avviene al
   salvataggio del DDT.

L'elenco clienti arriva dall'export Excel di Easyfatt (Clienti > Esporta) caricato dalla pagina
Esportazioni sul PC, che lo legge nel browser e lo manda al bridge. Il file del terminalino resta disponibile come ripiego.

Motivo del cambio rispetto alla v1 (file terminalino importato in un DDT): nell'installazione
cloud di Imballaggi Brunelli l'importazione da terminale portatile non era disponibile
(`DECISIONI.md` punto 52). Danea l'ha poi abilitata (collaudo T10, punto 70): il file resta il canale
di inventario e carico, i DDT restano ordini e-commerce.

### 3.4 Carico

Tipo `carico`. In Easyfatt si importa in un Arrivo merce fornitore (Utilità > Importa da
terminale portatile) oppure in Magazzino > Movimenti > Carica.

### 3.5 Consultazione

Scansione o ricerca, scheda prodotto locale. Nessuna sessione, nessun upload.

### 3.6 Codice sconosciuto

Se il barcode letto non è in catalogo, l'app propone la ricerca per abbinarlo a un prodotto.
L'abbinamento è salvato con origine `app`, vale da subito sul telefono, viene inviato al bridge e
compare in `/api/barcode/nuovi.csv` per essere riportato in Easyfatt (in scheda prodotto o con
l'importazione prodotti da Excel). Funzione da valutare sul campo.

## 4. Sicurezza

- Tutto in HTTPS (obbligatorio anche per la fotocamera nel browser).
- Easyfatt autentica con Basic auth, supportata nativamente dal suo modulo e-commerce.
- La PWA usa un token Bearer per tenant, inserito una volta nelle impostazioni o via QR.
- Nessun dato personale oltre a codici, descrizioni e prezzi dei prodotti. Con i DDT v2 arriveranno anagrafiche clienti: da valutare in quella fase.
- Rate limiting e blocco brute force sul login sono rimandati a quando l'app avrà più tenant.

## 5. Hosting e deploy

- Cloudflare Workers (piano gratuito), D1 per i dati, asset statici nel Worker. Un solo dominio, nessun CORS.
- Ambienti: `dev` locale con `wrangler dev` e D1 locale; `produzione` su Cloudflare.
- CI GitHub Actions: su ogni PR typecheck, lint, test, build. Su `main` anche `wrangler deploy`.
- Segreti: `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` nei secret di GitHub; credenziali tenant nei secret del Worker.

## 6. Cosa è fuori scope in v1

- DDT diretti (`DocumentType` D) e arrivi merce (H) via ricezione e-commerce: non provati nel collaudo T10 (serviva un archivio di prova e il file del terminalino funziona); i DDT nascono come ordini cliente e il carico resta sul file del terminalino.
- Lotti e scadenze: supportati nella libreria, assenti dalla UI.
- Multi-magazzino: il campo esiste nel catalogo, la UI ne assume uno solo.
- Agente Windows per depositare i file: non serve, si scarica dal browser.
- Quantità da barcode di confezione (`PackageQty`): parsato, non usato.
- Gestione tenant self-service, fatturazione, onboarding.
