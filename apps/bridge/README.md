# Bridge

Cloudflare Worker (Hono + D1) che riceve il catalogo da Danea Easyfatt, lo serve alla PWA e
distribuisce la PWA compilata come asset statico. Vedi `docs/ARCHITETTURA.md` sezione 2.3.

## Endpoint di questo task (T03)

| Metodo | Percorso | Auth | Scopo |
| --- | --- | --- | --- |
| POST | `/easyfatt/catalogo` | Basic | Riceve `EasyfattProducts` nel campo multipart `file`. Risponde `OK` in testo puro. |
| GET | `/easyfatt/documenti` | Basic | Polling dei documenti: in v1 un `EasyfattDocuments` vuoto (dal T13 in poi vedi sotto). |
| GET | `/api/stato` | Bearer | Nome tenant, data ultimo catalogo, numero prodotti. |
| GET | `/api/catalogo?dal=ISO` | Bearer | Catalogo completo o delta. |
| GET | `/api/salute` | — | Diagnostica. |

## Endpoint di questo task (T04)

| Metodo | Percorso | Auth | Scopo |
| --- | --- | --- | --- |
| POST | `/api/sessioni` | Bearer | Upsert per `id` di una sessione chiusa con le righe. Risponde `{ id, ricevutaIl }` (dal T13 anche `numeroDocumento` per i ddt). |
| GET | `/api/sessioni?stato=` | Bearer | Elenco sessioni senza righe, con conteggio e somma delle quantità. |
| GET | `/api/sessioni/:id` | Bearer | Dettaglio con le righe in ordine. |
| PATCH | `/api/sessioni/:id` | Bearer | Cambio stato `chiusa → esportata → importata`. `409` se non ammesso. |
| GET | `/api/sessioni/:id/terminale.txt` | Bearer | File del terminalino generato al volo. Porta la sessione a `esportata`, salvo `?soloAnteprima=1`. |
| POST | `/api/barcode` | Bearer | Upsert di abbinamenti barcode → prodotto con origine `app`. Non tocca chi è già di Easyfatt. |
| GET | `/api/barcode/nuovi.csv` | Bearer | CSV degli abbinamenti con origine `app`, da riportare in Easyfatt. |

Il bridge conserva solo sessioni chiuse: gli stati che gestisce sono `chiusa`, `esportata` e
`importata`. Lo stato `aperta` dello schema di `packages/core` vive solo sul telefono; `POST
/api/sessioni` rifiuta qualsiasi sessione che non sia `chiusa` e `PATCH` rifiuta con `409`
qualunque transizione che porterebbe a uno stato diverso da quei tre.

Rinviare una sessione già ricevuta con lo stesso `id` (riapertura e richiusura sul telefono)
sostituisce campi e righe, mantiene `ricevuta_il` del primo invio e riporta lo stato a `chiusa`,
azzerando `esportata_il`/`importata_il`: l'export e l'import vanno rifatti. Per i ddt, `numero_documento`
non viene mai toccato da un upsert successivo: si assegna una sola volta (vedi T13).

Le risposte a Easyfatt sono sempre testo puro, mai JSON: qualsiasi corpo diverso da `OK` viene
mostrato dentro Easyfatt come messaggio di errore, quindi è una frase in italiano.

L'autenticazione di Easyfatt accetta sia `Authorization: Basic <base64>` sia gli header
`HTTP_X_AUTHORIZATION` e `X-Authorization` con il base64 di `utente:password`, con o senza il
prefisso `Basic`.

## Endpoint di questo task (T13)

| Metodo | Percorso | Auth | Scopo |
| --- | --- | --- | --- |
| POST | `/api/clienti/importa` | Bearer | Sostituisce l'elenco clienti (JSON `{ clienti: Cliente[] }`, già interpretato dalla PWA dall'export Easyfatt): upsert a blocchi e tombstone per gli assenti, come il catalogo `full`. Risponde `{ importati, eliminati }`. Max 2 MB, max 5000 clienti. |
| GET | `/api/clienti?dal=ISO` | Bearer | Clienti modificati dopo `dal`, più i codici eliminati; senza `dal` tutti. Stesso cursore del catalogo (`ultimo_clienti_il`). |
| DELETE | `/api/sessioni/:id` | Bearer | Cancella sessione e righe. `204`. `409` se `esportata` o `importata` (Easyfatt l'ha già scaricata): non si può più far sparire da sotto. `404` se non esiste. |
| GET | `/easyfatt/documenti` | Basic | Polling ordini: risponde con le sessioni `ddt` del tenant come ordini cliente (`DocumentType` C), filtrate su `firstnum`/`lastnum`/`firstdate`/`lastdate`. La prima consegna segna la sessione `esportata`; la seconda (Easyfatt chiede sempre `firstnum=1` e deduplica da sé) la segna `importata` e la rimanda comunque (decisione 68); le sessioni con numero minore di `firstnum` ancora `esportata` passano a `importata` (decisione 53). |

`POST /api/sessioni` accetta ora anche `cliente` (obbligatorio per i `ddt`, validato con lo schema
di core): alla prima ricezione di un ddt il bridge gli assegna un `numeroDocumento` progressivo per
tenant, leggendo e incrementando `tenant.prossimo_numero_documento` nello stesso `db.batch` della
scrittura della sessione, così due invii concorrenti non si scontrano (D1 serializza le scritture).
Il numero non cambia più, nemmeno se la sessione viene rispedita.

Una sessione ddt senza cliente (può capitare solo per ddt di v1, mai passate dalla ricezione
e-commerce, dopo la migrazione che assegna loro un numero) viene esclusa dalla risposta di
`/easyfatt/documenti` con un avviso in log, invece di far fallire l'intera richiesta.

Caricare i clienti con curl, come farebbe la pagina Esportazioni della PWA dopo aver interpretato
l'export di Easyfatt:

```bash
curl -X POST -H "Authorization: Bearer IL_TOKEN" -H "Content-Type: application/json" \
  -d '{"clienti":[{"id":"0018","origine":"easyfatt","nome":"Ceramiche Italiane","partitaIva":"03322350178","aggiornatoIl":"2026-09-17T10:00:00.000Z"}]}' \
  http://localhost:8787/api/clienti/importa
```

## Creare un tenant

Le credenziali non si scrivono a mano: le genera lo script, che salva nel database solo gli hash
SHA-256 e stampa i valori in chiaro **una volta sola**.

```bash
# database locale (quello usato da `pnpm --filter bridge dev`)
pnpm --filter bridge tenant:crea -- --nome "Imballaggi Brunelli" --utente easyfatt

# database di produzione su Cloudflare
pnpm --filter bridge tenant:crea -- --nome "Imballaggi Brunelli" --utente easyfatt --remote

# con QR di setup per la PWA (vedi sotto)
pnpm --filter bridge tenant:crea -- --nome "Imballaggi Brunelli" --utente easyfatt --remote \
  --url https://<dominio>
```

Lo script stampa nome, id, utente, **password Easyfatt** e **token app**. La password va nella
configurazione e-commerce di Easyfatt, il token nelle impostazioni della PWA. Non esiste modo di
rileggerli: se si perdono, si crea un nuovo tenant o si aggiornano gli hash a mano.

Con `--url https://<dominio>` (lo stesso dominio del Worker), lo script salva anche
`setup-<utente>.svg`: un QR del testo `terminalinobru://setup?url=...&token=...`, pensato per la
schermata Impostazioni > Importa da QR della PWA. Il file contiene il token in chiaro: va aperto
sul PC, inquadrato dal telefono e cancellato subito dopo. Non esiste un endpoint HTTP che generi
lo stesso QR: per chiamarlo servirebbe già il token che il QR deve fornire, quindi può nascere solo
qui, nell'unico momento in cui lo script lo conosce in chiaro.

Prima del primo uso, applicare le migrazioni:

```bash
pnpm --filter bridge exec wrangler d1 migrations apply DB --local
pnpm --filter bridge exec wrangler d1 migrations apply DB --remote
```

## Sviluppo locale

```bash
pnpm --filter pwa build                 # gli asset serviti dal Worker
pnpm --filter bridge dev                # worker su http://localhost:8787 con D1 locale
```

Prova dell'invio del catalogo, come lo farebbe Easyfatt:

```bash
curl -u easyfatt:LA_PASSWORD \
  -F file=@packages/easyfatt/test/fixture/catalogo-full-v2.xml \
  http://localhost:8787/easyfatt/catalogo
```

## Deploy in produzione

Passo passo per il titolare in `docs/RUNBOOK.md`. In breve: il worker di produzione si chiama
`terminalinobru` (sezione `[env.produzione]` di `wrangler.toml`, con l'id del D1 in chiaro) e lo
pubblica Cloudflare stesso a ogni push su `main`, con la repository collegata e questi campi di
build: `pnpm install --frozen-lockfile && pnpm -r build` e
`pnpm --filter bridge exec wrangler deploy --env produzione`. Le migrazioni D1 si applicano dal PC
con `wrangler d1 migrations apply DB --remote --env produzione`. Il workflow
`.github/workflows/deploy.yml` è la via di riserva, solo manuale.

## Note di implementazione

- Tutte le righe scritte da un invio del catalogo portano lo stesso `aggiornato_il`. In modalità
  `full` ciò che non porta quell'istante è considerato assente dal file e riceve il tombstone
  `eliminato_il`: così il "cancella ciò che non c'è più" costa due statement invece di uno per
  prodotto. Conseguenza voluta: dopo un invio `full` il delta `?dal=` restituisce tutto il
  catalogo, perché Easyfatt non dice quali prodotti siano davvero cambiati.
- Gli statement vanno in `db.batch` a blocchi di 50. Ogni blocco è atomico; il marcatore di invio
  riuscito è `tenant.ultimo_catalogo_il`, scritto solo alla fine. Se un blocco fallisce, il bridge
  risponde con un errore leggibile e il tenant resta con la data dell'invio precedente.
- I barcode con origine `app` (abbinati nella PWA) non ricevono mai il tombstone dal catalogo. Se
  però Easyfatt invia lo stesso barcode, l'abbinamento passa a origine `easyfatt` e da quel momento
  è Easyfatt a possederlo.
- Nessuna logica di protocollo sta qui: l'analisi dell'XML è in `packages/easyfatt`.
- D1 accetta al massimo 100 parametri legati per statement: le query con `IN (...)` (descrizioni
  dei prodotti e righe delle sessioni nella ricezione documenti) vanno a blocchi di
  `PARAMETRI_PER_QUERY` elementi, come le scritture vanno a blocchi di `STATEMENT_PER_BLOCCO`.
- L'importazione clienti (`POST /api/clienti/importa`) tratta l'elenco ricevuto come un catalogo
  `full`: stesso schema di tombstone di `salvaCatalogo`, marcatore `tenant.ultimo_clienti_il`
  scritto solo alla fine. Solo i clienti dell'export Easyfatt vivono su D1 (`origine: 'easyfatt'`):
  quelli creati in app restano sul telefono e viaggiano dentro la sessione (`Sessione.cliente`).
- `GET /easyfatt/documenti` legge la data di chiusura delle sessioni nel fuso `Europe/Rome`
  (docs/DECISIONI.md punto 60) per confrontarla con `firstdate`/`lastdate`, che Easyfatt manda come
  data di calendario senza fuso. Il filtro `firstnum`/`lastnum` invece è sempre sul numero.
