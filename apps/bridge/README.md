# Bridge

Cloudflare Worker (Hono + D1) che riceve il catalogo da Danea Easyfatt, lo serve alla PWA e
distribuisce la PWA compilata come asset statico. Vedi `docs/ARCHITETTURA.md` sezione 2.3.

## Endpoint di questo task (T03)

| Metodo | Percorso | Auth | Scopo |
| --- | --- | --- | --- |
| POST | `/easyfatt/catalogo` | Basic | Riceve `EasyfattProducts` nel campo multipart `file`. Risponde `OK` in testo puro. |
| GET | `/easyfatt/documenti` | Basic | Polling dei documenti: in v1 un `EasyfattDocuments` vuoto. |
| GET | `/api/stato` | Bearer | Nome tenant, data ultimo catalogo, numero prodotti. |
| GET | `/api/catalogo?dal=ISO` | Bearer | Catalogo completo o delta. |
| GET | `/api/salute` | — | Diagnostica. |

## Endpoint di questo task (T04)

| Metodo | Percorso | Auth | Scopo |
| --- | --- | --- | --- |
| POST | `/api/sessioni` | Bearer | Upsert per `id` di una sessione chiusa con le righe. Risponde `{ id, ricevutaIl }`. |
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
azzerando `esportata_il`/`importata_il`: l'export e l'import vanno rifatti.

Le risposte a Easyfatt sono sempre testo puro, mai JSON: qualsiasi corpo diverso da `OK` viene
mostrato dentro Easyfatt come messaggio di errore, quindi è una frase in italiano.

L'autenticazione di Easyfatt accetta sia `Authorization: Basic <base64>` sia gli header
`HTTP_X_AUTHORIZATION` e `X-Authorization` con il base64 di `utente:password`, con o senza il
prefisso `Basic`.

## Creare un tenant

Le credenziali non si scrivono a mano: le genera lo script, che salva nel database solo gli hash
SHA-256 e stampa i valori in chiaro **una volta sola**.

```bash
# database locale (quello usato da `pnpm --filter bridge dev`)
pnpm --filter bridge tenant:crea -- --nome "Imballaggi Brunelli" --utente easyfatt

# database di produzione su Cloudflare
pnpm --filter bridge tenant:crea -- --nome "Imballaggi Brunelli" --utente easyfatt --remote
```

Lo script stampa nome, id, utente, **password Easyfatt** e **token app**. La password va nella
configurazione e-commerce di Easyfatt, il token nelle impostazioni della PWA. Non esiste modo di
rileggerli: se si perdono, si crea un nuovo tenant o si aggiornano gli hash a mano.

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
