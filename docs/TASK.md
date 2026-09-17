# Piano dei task

Ogni task si esegue in una **nuova chat Claude Code** nella cartella della repo, con il modello e
l'effort indicati, incollando il prompt della sezione. Quando la PR è aperta, si apre una **chat di
revisione con Opus 5, effort medium**, con il prompt della sezione "Revisione". La chat di revisione
fa il merge e aggiorna la tabella qui sotto.

Modelli: Sonnet 5 per lavoro ben specificato e ripetitivo, Opus 5 per logica delicata e UI,
Fable 5.1 solo se un task si incaglia. Effort: `medium` di norma, `high` dove servono ragionamento
e test approfonditi, `low` per documentazione.

## Stato

| Task | Titolo | Modello | Effort | Stato | PR |
| --- | --- | --- | --- | --- | --- |
| T00 | Documentazione di architettura | Fable 5.1 | — | fatto | diretto su main |
| T01 | Scaffold monorepo e CI | Sonnet 5 | medium | fatto | [#1](https://github.com/schultz-it/TerminalinoBru/pull/1) |
| T02 | Libreria `core` ed `easyfatt` | Opus 5 | high | fatto | [#2](https://github.com/schultz-it/TerminalinoBru/pull/2) |
| T03 | Bridge: schema, auth, catalogo | Opus 5 | high | fatto | [#3](https://github.com/schultz-it/TerminalinoBru/pull/3) |
| T04 | Bridge: sessioni e barcode | Sonnet 5 | high | fatto | [#4](https://github.com/schultz-it/TerminalinoBru/pull/4) |
| T05 | PWA: base, sync, ricerca, consultazione | Opus 5 | medium | fatto | [#5](https://github.com/schultz-it/TerminalinoBru/pull/5) |
| T06 | PWA: scanner | Opus 5 | high | fatto | [#6](https://github.com/schultz-it/TerminalinoBru/pull/6) |
| T07 | PWA: sessioni ed export | Opus 5 | high | fatto | [#7](https://github.com/schultz-it/TerminalinoBru/pull/7) |
| T08 | PWA: pagina Esportazioni e codici sconosciuti | Sonnet 5 | medium | fatto | [#8](https://github.com/schultz-it/TerminalinoBru/pull/8) |
| T09 | Deploy Cloudflare e runbook | Sonnet 5 | medium | fatto | [#9](https://github.com/schultz-it/TerminalinoBru/pull/9) |
| T12 | v2 libreria: ordini XML, parametri ricezione, clienti da export | Opus 5 | medium | fatto | [#12](https://github.com/schultz-it/TerminalinoBru/pull/12) |
| T13 | v2 bridge: clienti, numerazione, ricezione documenti | Sonnet 5 | high | fatto | [#13](https://github.com/schultz-it/TerminalinoBru/pull/13) |
| T14 | v2 PWA: clienti, cliente nel DDT, Esportazioni | Opus 5 | high | fatto | [#14](https://github.com/schultz-it/TerminalinoBru/pull/14) |
| T10 | Collaudo con Easyfatt reale | Opus 5 | high | da fare | |
| T11 | Guida utente | Sonnet 5 | low | da fare | |

## Prompt comune di apertura

Ogni prompt sotto inizia implicitamente così (incollarlo prima del testo del task):

```
Lavori nella repo TerminalinoBru. Esegui `git checkout main && git pull`. Leggi CLAUDE.md,
docs/ARCHITETTURA.md e la sezione del tuo task in docs/TASK.md. Leggi gli altri documenti in docs/
solo se il task li cita. Crea il branch indicato, lavora, committa con messaggi in italiano, apri la
PR verso main con `gh pr create` usando il titolo del task, e nella descrizione elenca cosa hai
fatto, i comandi eseguiti con esito, e cosa non hai potuto verificare. Non fare merge. Se trovi
un'incoerenza tra i documenti e quello che devi fare, fermati e segnalalo nella PR invece di
inventare.
```

## Prompt di revisione (Opus 5, medium)

```
Lavori nella repo TerminalinoBru come revisore. Leggi CLAUDE.md e la sezione del task TNN in
docs/TASK.md. Fai checkout della PR #NN con `gh pr checkout NN`. Esegui pnpm install, pnpm -r
typecheck, pnpm -r lint, pnpm -r test, pnpm -r build e riporta l'esito reale. Verifica uno per uno i
criteri di accettazione del task. Leggi il codice cercando: logica di dominio finita nel posto
sbagliato, dipendenze non richieste, segreti in chiaro, test che non testano nulla, testo in
inglese dove doveva essere italiano. Correggi direttamente i problemi piccoli con un commit sulla
PR; per i problemi grandi scrivi un commento sulla PR e fermati. Se tutto è a posto: squash merge
con `gh pr merge NN --squash --delete-branch`, poi su main aggiorna la riga del task in
docs/TASK.md (stato "fatto", numero PR) e committa. Riporta un riepilogo di tre righe.
```

---

## T01 — Scaffold monorepo e CI

Modello: **Sonnet 5**, effort **medium**. Branch `task/01-scaffold`.

```
Crea lo scheletro del monorepo descritto in CLAUDE.md, senza logica applicativa.

- pnpm workspaces con `apps/*` e `packages/*`, Node 22 in `.nvmrc` e `engines`. TypeScript strict
  con `tsconfig.base.json` condiviso. ESLint (flat config) + Prettier con configurazione unica alla
  radice. Script alla radice: `typecheck`, `lint`, `test`, `build` che delegano con `pnpm -r`.
- `packages/core` e `packages/easyfatt`: pacchetti TypeScript con `src/index.ts` che esporta un
  segnaposto, Vitest configurato, un test banale che passa. `easyfatt` dipende da `fast-xml-parser`;
  `core` da `zod`.
- `apps/bridge`: Cloudflare Worker con Hono. `wrangler.toml` con binding D1 `DB`, binding assets
  che punta a `../pwa/dist` con `not_found_handling = "single-page-application"` e
  `run_worker_first = ["/api/*", "/easyfatt/*"]`. Un endpoint `GET /api/salute` che risponde
  `{ "ok": true }`. Cartella `migrations/` vuota con un README di una riga. Vitest con
  `@cloudflare/vitest-pool-workers` e un test sull'endpoint. Un file `.dev.vars.example`.
- `apps/pwa`: Vite + React + TypeScript + Tailwind v4 + `vite-plugin-pwa` con manifest
  (nome "TerminalinoBru", colore tema, icone segnaposto generate come PNG semplici), `display:
  standalone`. Una pagina che mostra "TerminalinoBru" e chiama `/api/salute` mostrando l'esito.
  In dev, proxy di `/api` verso `http://localhost:8787`. Vitest con jsdom e un test banale.
- GitHub Actions `.github/workflows/ci.yml`: su PR e push su main, pnpm install con cache,
  typecheck, lint, test, build. Nessun deploy.
- Aggiorna la sezione "Comandi" di CLAUDE.md solo se i comandi reali differiscono.

Criteri di accettazione: `pnpm install && pnpm -r typecheck && pnpm -r lint && pnpm -r test &&
pnpm -r build` passano in locale; `pnpm --filter bridge dev` serve la PWA compilata e l'endpoint
salute; il workflow CI è verde sulla PR.
```

## T02 — Libreria `core` ed `easyfatt`

Modello: **Opus 5**, effort **high**. Branch `task/02-librerie`. Leggi anche
`docs/PROTOCOLLI-DANEA.md` (sezioni 1, 2 e 3) e `docs/MODELLO-DATI.md` (sezione 1).

```
Implementa `packages/core` e `packages/easyfatt` come descritto in docs/ARCHITETTURA.md sezioni
2.1 e 2.2, con i tipi di docs/MODELLO-DATI.md sezione 1 e i formati di docs/PROTOCOLLI-DANEA.md.

packages/core:
- Tipi e schemi zod per Prodotto, Barcode, Sessione, Riga, Impostazioni, con i valori di default.
- `aggregaRighe`, `normalizza`, `cercaProdotti` (con costruzione dell'indice separata:
  `costruisciIndice(prodotti)`), `transizioneStato`, `rilevaInputLettore` (riceve eventi
  `{tasto, istante}` e restituisce il codice quando riconosce una raffica sotto 50 ms per tasto
  terminata da Invio, altrimenti null; deve ignorare la digitazione umana).
- Test unitari per ogni funzione, inclusi casi limite: query vuota, accenti, codici con simboli
  come `+banp_1200800p`, quantità decimali, sessione riaperta.

packages/easyfatt:
- `analizzaStringaFormato(stringa)`: restituisce `{ tipo: 'delimitato' | 'fisso', campi, separatore }`
  o un errore descrittivo in italiano. Caratteri ammessi A Q q L S X; in delimitato ogni campo è una
  sola lettera separata da un carattere non lettera; in fisso solo lettere con lunghezze per
  posizione. Rifiuta stringhe senza A o senza Q.
- `generaFileTerminale(righe, opzioni)`: righe `{codice, quantita, lotto?, scadenza?}`, opzioni
  `{stringaFormato, separatoreDecimale, fineRiga}`. Delimitato: campi nell'ordine della stringa,
  L e S vuoti se assenti, X vuoto. Fisso: codice allineato a sinistra riempito con spazi e troncato
  se più lungo, Q intero allineato a destra con zeri, q decimali troncati. Quantità con al massimo
  3 decimali, senza zeri finali. Scadenza in formato `aaaammgg`.
- `analizzaCatalogo(xml)`: parser di EasyfattProducts protocollo 2 e 3, modalità full e
  incremental. Restituisce `{ modalita, magazzino?, prodotti: Prodotto[], barcode: Barcode[],
  codiciEliminati: string[] }`. Un prodotto genera un Barcode per `Barcode`, uno per ogni
  `ExtraBarcodes/Barcode` (con quantitaConfezione da PackageQty) e uno per ogni `Variants/Variant/
  Barcode`, tutti con origine 'easyfatt'. Prezzi NetPrice1..9 e GrossPrice1..9 in array; campi
  mancanti diventano undefined, mai stringhe vuote. Errori di parsing con messaggio in italiano.
  Deve reggere cataloghi da 10.000 prodotti senza ricorsione profonda.
- `generaDocumentiVuoto()`: l'XML EasyfattDocuments vuoto di docs/PROTOCOLLI-DANEA.md sezione 3.
- Fixture in `packages/easyfatt/test/fixture/`: un catalogo full v2 con 3 prodotti che coprono
  tutti i campi, uno v3 con varianti, uno incremental con UpdatedProducts e DeletedProducts, uno
  malformato. Test per ogni funzione e ogni fixture, più test di proprietà sul round trip
  stringa formato → file → righe attese.

Criteri di accettazione: copertura 100% righe su `packages/easyfatt` (riporta il numero reale);
nessuna dipendenza aggiunta oltre zod e fast-xml-parser; le API sono esportate da `src/index.ts`
con JSDoc in italiano di una riga per funzione.
```

## T03 — Bridge: schema, auth, catalogo

Modello: **Opus 5**, effort **high**. Branch `task/03-bridge-catalogo`. Leggi anche
`docs/MODELLO-DATI.md` (sezioni 2 e 4) e `docs/PROTOCOLLI-DANEA.md` (sezione 2).

```
Implementa in apps/bridge lo schema D1, l'autenticazione e la ricezione del catalogo.

- Migrazione `0001_schema.sql` con le tabelle di docs/MODELLO-DATI.md sezione 2.
- Script `pnpm --filter bridge tenant:crea -- --nome "..." --utente "..."` che genera password
  Easyfatt e token app casuali, stampa i valori in chiaro una sola volta e inserisce il tenant con
  gli hash SHA-256 (usa `wrangler d1 execute`, con flag `--remote` opzionale). Documenta l'uso in
  apps/bridge/README.md.
- Middleware `autenticaEasyfatt`: Basic auth oppure header `HTTP_X_AUTHORIZATION`/`X-Authorization`
  con base64 di `utente:password`; risolve il tenant; confronto hash a tempo costante; su fallimento
  risponde 401 con testo puro "Credenziali non valide" e header `WWW-Authenticate: Basic`.
- Middleware `autenticaApp`: `Authorization: Bearer <token>`; risolve il tenant; 401 JSON
  `{ "errore": "Token non valido" }`.
- `POST /easyfatt/catalogo`: legge il campo multipart `file`, chiama `analizzaCatalogo` da
  packages/easyfatt, esegue upsert di prodotti e barcode a blocchi di 50 statement con `db.batch`
  in una transazione logica (se un blocco fallisce, risponde errore e lascia `ultimo_catalogo_il`
  invariato). In modalità full imposta `eliminato_il` sui prodotti e barcode di origine easyfatt
  assenti nel file; in incremental applica solo Updated e Deleted. I barcode con origine `app`
  non vengono mai toccati dal catalogo, ma se Easyfatt invia lo stesso barcode l'origine diventa
  easyfatt. Aggiorna `ultimo_catalogo_il`. Risponde `200` con corpo esattamente `OK`. Su errore
  risponde `400` con una frase in italiano leggibile, mai JSON, mai stack trace.
- `GET /easyfatt/documenti`: risponde `generaDocumentiVuoto()` con content-type
  `application/xml; charset=utf-8`.
- `GET /api/stato` e `GET /api/catalogo?dal=` come da docs/MODELLO-DATI.md sezione 4. Senza `dal`
  restituisce tutti i non eliminati; con `dal` anche gli eliminati dopo quella data nelle liste
  `*Eliminati`. Limite di risposta: se i prodotti superano 20.000 restituisci 413 con messaggio.
- Test con vitest-pool-workers e D1 in memoria con le migrazioni applicate: auth ok/ko per entrambi
  i middleware, push full poi incremental con verifica dei tombstone, delta con `dal`, catalogo
  malformato, corpo senza campo file. Usa le fixture di packages/easyfatt (importale, non copiarle).

Criteri di accettazione: `curl -u utente:password -F file=@fixture.xml localhost:8787/easyfatt/
catalogo` risponde `OK` in dev locale (riporta l'output); i test coprono ogni ramo di errore;
nessuna logica di parsing nel bridge.
```

## T04 — Bridge: sessioni e barcode

Modello: **Sonnet 5**, effort **high**. Branch `task/04-bridge-sessioni`. Leggi anche
`docs/MODELLO-DATI.md` (sezioni 2 e 4).

```
Implementa in apps/bridge gli endpoint sessioni e barcode, tutti dietro `autenticaApp`.

- `POST /api/sessioni`: valida con lo schema zod di packages/core (stato deve essere "chiusa",
  righe non vuote). Upsert per id: se esiste, sostituisce righe e campi, mantiene `ricevuta_il`
  originale e riporta lo stato a "chiusa". Risposta 201 `{ id, ricevutaIl }`.
- `GET /api/sessioni?stato=`: elenco senza righe, ordinato per `chiusa_il` decrescente, con
  conteggio righe e somma quantità. `GET /api/sessioni/:id`: con righe in ordine.
- `PATCH /api/sessioni/:id` `{ stato }`: usa `transizioneStato` di core; 409 se non ammessa;
  imposta `esportata_il` o `importata_il`.
- `GET /api/sessioni/:id/terminale.txt`: aggrega con `aggregaRighe`, genera con
  `generaFileTerminale` usando `stringa_formato` e `separatore_decimale` del tenant, risponde
  `text/plain; charset=utf-8` con `Content-Disposition: attachment; filename="terminale-<tipo>-
  <nome-sanificato>-<aaaammgg>.txt"`. Se lo stato è "chiusa" lo porta a "esportata" (query
  `?soloAnteprima=1` per non cambiare stato).
- `POST /api/barcode`: array di abbinamenti; upsert con origine "app" solo se il barcode non ha già
  origine "easyfatt"; 204. `GET /api/barcode/nuovi.csv`: CSV con intestazione `codice;barcode`
  degli abbinamenti con origine "app", `text/csv`.
- Test: ciclo completo crea → elenco → dettaglio → file → PATCH; transizioni vietate; upsert
  ripetuto; barcode già di Easyfatt non sovrascritto; sessione di un altro tenant non visibile
  (crea due tenant nel test).

Criteri di accettazione: il file generato per una sessione con lo stesso prodotto su due righe
contiene una sola riga con la somma; tutti gli endpoint rispondono 401 senza token.
```

## T05 — PWA: base, sync, ricerca, consultazione

Modello: **Opus 5**, effort **medium**. Branch `task/05-pwa-base`. Leggi anche
`docs/MODELLO-DATI.md` (sezioni 1, 3 e 4) e `docs/STILE.md` per intero.

```
Costruisci l'ossatura della PWA in apps/pwa: navigazione, persistenza, sincronizzazione del
catalogo, ricerca e scheda prodotto. Niente scanner (T06) e niente sessioni (T07): lascia i punti
di aggancio.

- Stile: segui docs/STILE.md alla lettera. Token colore e font in `src/stile.css` con `@theme`,
  solo i token del marchio nelle classi, niente colori di Tailwind. Dipendenze ammesse per lo
  stile: `@fontsource-variable/montserrat` e `lucide-react`. Sostituisci le icone segnaposto di T01
  con l'icona descritta in docs/STILE.md sezione 5 (ritaglia la testa dello schnauzer da
  docs/brand/logo-imballare.png con uno script una tantum, non aggiungere dipendenze di runtime)
  e aggiorna `theme_color` e `background_color` nel manifest.
- Dexie con gli store di docs/MODELLO-DATI.md sezione 3, in `src/db.ts`. Hook `useImpostazioni`.
- Router (react-router) con le rotte: `/` Home, `/consulta` Consultazione, `/sessioni/:id`
  (segnaposto), `/esportazioni` (segnaposto), `/impostazioni`. Layout mobile-first con barra
  inferiore a 4 voci e target touch di almeno 48 px. Tailwind, nessuna libreria di componenti.
  Testi UI in italiano.
- Impostazioni: URL bridge, token (mascherato), stringa formato con validazione tramite
  `analizzaStringaFormato` e messaggio d'errore, separatore decimale, listino mostrato, modalità
  predefinita, suoni, vibrazione, nome dispositivo. Pulsante "Verifica connessione" che chiama
  `/api/stato` e mostra nome tenant, data ultimo catalogo, numero prodotti. Pulsante "Sincronizza
  catalogo".
- Modulo `src/sync/catalogo.ts`: scarica `/api/catalogo?dal=` con il cursore `aggiornatoIl`
  salvato dalla risposta precedente (mai l'orologio del telefono, vedi docs/MODELLO-DATI.md
  sezione 4), applica in una transazione Dexie (upsert e cancellazioni), salva il nuovo cursore. Sync
  automatica all'avvio se online e sono passate più di 6 ore. Gestione errori con messaggio
  leggibile, mai crash. Un componente `StatoRete` mostra online/offline e data ultima sync.
- Ricerca: `costruisciIndice` di core in un hook con cache in memoria invalidata dopo la sync;
  campo di ricerca con risultati mentre si digita, massimo 30, evidenziando codice e descrizione.
- Scheda prodotto (`/consulta/:codice`): descrizione, codice, prezzo del listino scelto netto e
  lordo, giacenza con "aggiornata il", ordinato, scorta minima, ubicazione, categoria, barcode
  associati, note. Segnaposto per il pulsante scansione.
- Home: card "Nuova sessione" (disabilitata, T07), "Consulta prodotto", stato sync.
- Setup via QR: su `/impostazioni` un pulsante "Importa da QR" segnaposto che accetta per ora un
  testo incollato nel formato `terminalinobru://setup?url=...&token=...` (lo scanner arriva in T06).
- Test: sync con risposte finte (msw non serve, basta un fetch mock), ricerca, validazione
  impostazioni.

Criteri di accettazione: con il bridge in dev e un catalogo caricato, la PWA sincronizza, cerca
per codice e descrizione e mostra la scheda; con la rete spenta tutto continua a funzionare;
installabilità verificata in Chrome (Lighthouse dalla versione 12 non ha più la categoria PWA:
riporta i punteggi delle altre categorie); screenshot di Home, Consultazione e Impostazioni
allegati alla PR, coerenti con docs/STILE.md.
```

## T06 — PWA: scanner

Modello: **Opus 5**, effort **high**. Branch `task/06-pwa-scanner`.

```
Implementa il componente scanner della PWA come descritto in docs/ARCHITETTURA.md sezione 2.4.

- `src/scanner/Scanner.tsx`: espone `onCodice(codice, sorgente)` con sorgente `fotocamera` |
  `lettore` | `manuale`. Tre sorgenti sempre attive quando il componente è montato.
- Fotocamera: `BarcodeDetector` nativo se disponibile, altrimenti il polyfill `barcode-detector`
  (aggiungilo come dipendenza). Formati: ean_13, ean_8, upc_a, upc_e, code_128, code_39, itf, qr_code.
  Video a pieno schermo con riquadro guida, torcia se supportata, scelta fotocamera posteriore.
  Anti-rimbalzo: lo stesso codice non viene riemesso per 1,5 s. Rilascia la fotocamera quando il
  componente viene smontato o la pagina va in background. Gestisci il rifiuto del permesso con
  un messaggio e il pulsante per riprovare.
- Lettore in modalità tastiera: listener `keydown` a livello documento che alimenta
  `rilevaInputLettore` di core; non deve interferire con i campi di testo in cui l'utente sta
  digitando (distingui tramite la velocità dei tasti, non tramite il focus).
- Manuale: campo di testo con pulsante "Cerca" che emette il codice digitato.
- Feedback: suono breve di conferma e vibrazione 50 ms per codice trovato; suono diverso e
  vibrazione doppia per codice sconosciuto. Suoni generati con Web Audio, niente file. Rispetta le
  impostazioni suoni/vibrazione.
- Risoluzione: hook `useRisolviCodice(codice)` che cerca prima in `barcode`, poi in `prodotti`
  per codice esatto, e restituisce il prodotto o `null`.
- Integra nella Consultazione: pulsante scansione apre lo scanner, codice trovato porta alla
  scheda; codice sconosciuto mostra il flusso "Abbina a un prodotto" con la ricerca, salva in
  Dexie con origine "app" e accoda l'invio al bridge (`codaUpload`).
- Completa "Importa da QR" nelle Impostazioni con lo scanner.
- Pagina di prova `/scanner-test` (solo in dev) che elenca i codici letti con sorgente e tempi.
- Test sulle funzioni pure (anti-rimbalzo, parsing del QR di setup, risoluzione).

Criteri di accettazione: su Chrome Android reale legge un EAN-13 stampato in meno di un secondo
(riporta come hai verificato, o segnala che non hai potuto); un lettore Bluetooth simulato con
eventi tastiera sintetici viene riconosciuto; la fotocamera si spegne uscendo dalla pagina.
```

## T07 — PWA: sessioni ed export

Modello: **Opus 5**, effort **high**. Branch `task/07-pwa-sessioni`. Leggi anche
`docs/MODELLO-DATI.md` (sezioni 1 e 3).

```
Implementa le sessioni di lavoro nella PWA (docs/ARCHITETTURA.md sezioni 3.2, 3.3, 3.4).

- Home: "Nuova sessione" con scelta tipo (inventario, DDT, carico), nome (proposto:
  "<Tipo> <data> <ora>"), note, modalità scansione (default da impostazioni). Elenco sessioni
  aperte e delle ultime chiuse con tipo, nome, righe, stato.
- Schermata sessione: scanner in alto (riuso di T06), sotto l'ultima riga inserita e l'elenco
  righe in ordine inverso con modifica quantità e cancellazione (con conferma). In modalità
  "chiedi quantità": dopo la lettura si apre un foglio con descrizione, giacenza teorica (se
  inventario), tastierino numerico grande, decimali ammessi, conferma con Invio o pulsante; il
  fuoco resta sul tastierino, non serve toccare. In modalità "somma uno": ogni lettura aggiunge
  una riga da 1 e mostra il totale corrente del prodotto. Codice sconosciuto: stesso flusso di
  abbinamento di T06, poi prosegue con la quantità. Ricerca testuale sempre disponibile per
  inserire senza barcode.
- Riepilogo prima della chiusura: righe aggregate per prodotto (`aggregaRighe`), totale righe e
  pezzi, per inventario un indicatore delle differenze rispetto alla giacenza teorica.
- Chiudi sessione: stato "chiusa", upload `POST /api/sessioni`; se offline o errore, accoda in
  `codaUpload` e mostra "in attesa di invio". Un servizio in `src/sync/coda.ts` riprova all'avvio
  e quando torna la rete. Riapri sessione: torna "aperta" (verrà rispedita alla richiusura).
- Condividi file dal telefono: pulsante "Condividi file" che genera il file con
  `generaFileTerminale` e le impostazioni locali e usa `navigator.share` con un File, fallback
  download. Serve quando il bridge non è raggiungibile.
- Pulizia: le sessioni "importata" più vecchie di 90 giorni si possono cancellare dalla Home.
- Test: flusso aggiungi/modifica/cancella riga, aggregazione nel riepilogo, coda upload con
  fetch mock che fallisce poi riesce.

Note da T06: `Scanner` espone `onCodice(codice, sorgente)` e usa l'esito restituito (`trovato` |
`sconosciuto` | `ignorato`) per suono e vibrazione; il lettore Bluetooth è ascoltato solo mentre
`Scanner` è montato, quindi nella schermata sessione tienilo montato; l'anti-rimbalzo riemette un
codice fermo nell'inquadratura solo dopo 1,5 s senza vederlo. `Scanner` è un dialog a schermo
intero (`fixed inset-0`) con un pannello inferiore che accetta `children`: nella schermata sessione
metti lì riga corrente, elenco righe e chiusura, oppure aggiungi al componente una proprietà per la
modalità incorporata; non duplicarlo. In `codaUpload` esistono già voci
`{ tipo: 'barcode', riferimento: <barcode> }` create dall'abbinamento: `src/sync/coda.ts` le invia
con `POST /api/barcode` leggendo l'abbinamento dallo store `barcode`, oltre alle sessioni
(`riferimento` = id sessione).

Criteri di accettazione: un inventario di 20 letture con 3 prodotti ripetuti produce un file con
il numero giusto di righe e le somme corrette; chiudere offline e poi riconnettersi invia la
sessione una sola volta; nessuna quantità zero o negativa è accettata senza avviso.
```

## T08 — PWA: pagina Esportazioni e codici sconosciuti

Modello: **Sonnet 5**, effort **medium**. Branch `task/08-pwa-esportazioni`.

```
Completa la pagina `/esportazioni` della PWA, pensata per essere usata dal browser del PC dove
gira Easyfatt, e la gestione dei barcode abbinati in app.

- Elenco da `GET /api/sessioni` con filtro per stato (default: chiuse ed esportate), colonne tipo,
  nome, data chiusura, dispositivo, righe, pezzi, stato. Layout che su schermo largo diventa una
  tabella, su telefono un elenco.
- Per ogni sessione: "Scarica terminale.txt" (link a `/api/sessioni/:id/terminale.txt` con il
  token passato in header tramite fetch e download via blob, non nell'URL), "Anteprima" che mostra
  il contenuto del file in un riquadro monospazio, "Segna come importata" (PATCH), "Riporta a
  chiusa" per rifare l'export (PATCH con stato "chiusa").
- Riquadro istruzioni per ogni tipo di sessione con il percorso esatto in Easyfatt (prendi il
  testo da docs/PROTOCOLLI-DANEA.md sezione 1.3), richiudibile.
- Sezione "Barcode abbinati in app": conteggio da `/api/barcode/nuovi.csv`, pulsante di download
  del CSV, testo che spiega come riportarli in Easyfatt.
- Sync della coda: se ci sono elementi in `codaUpload` mostra un avviso con pulsante "Invia ora".
- Allineamento dello stato locale (`src/sync/sessioni.ts`): all'avvio della PWA, dopo ogni giro
  della coda e all'apertura di `/esportazioni`, `GET /api/sessioni` e aggiornamento dello stato
  delle sessioni locali non aperte (`chiusa` → `esportata`/`importata`, `esportata` → `chiusa` se
  riportata dal PC). Solo lettura verso il bridge; le sessioni aperte sul telefono non si toccano.
  Serve perché oggi sul telefono le sessioni restano "chiusa" per sempre: la pulizia delle
  importate a 90 giorni (T07) non trova nulla e si può riaprire una sessione già esportata
  (`transizioneStato` la bloccherà da solo, una volta allineato lo stato).
- Test sulle funzioni pure (formattazione nomi file, filtri, allineamento degli stati).

Criteri di accettazione: da Chrome desktop si scarica il file e il nome corrisponde a quello
impostato dal bridge; il cambio stato si riflette subito nell'elenco.
```

## T09 — Deploy Cloudflare e runbook

Modello: **Sonnet 5**, effort **medium**. Branch `task/09-deploy`.

```
Prepara il deploy in produzione su Cloudflare e il runbook di configurazione.

- `wrangler.toml`: ambiente di produzione con nome worker `terminalinobru`, D1 di produzione
  (id da variabile, non in chiaro se non necessario), asset dalla build della PWA.
- Workflow `.github/workflows/deploy.yml`: su push su main, dopo i test, `pnpm -r build` e
  `wrangler deploy` con `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` dai secret; applica le
  migrazioni D1 remote prima del deploy.
- `docs/RUNBOOK.md` in italiano, passo passo per il titolare: creare account Cloudflare, creare
  il D1, impostare i secret in GitHub, primo deploy, creare il tenant con lo script di T03 e
  conservare le credenziali, dominio personalizzato opzionale. Poi la configurazione in Easyfatt:
  Opzioni > Moduli > Magazzino stringa formato `A,Q`; Opzioni > Moduli > E-commerce terzo sito
  personalizzato con URL `https://<dominio>/easyfatt/catalogo` per l'aggiornamento prodotti e
  `https://<dominio>/easyfatt/documenti` per la ricezione ordini, login e password; come lanciare
  l'aggiornamento prodotti; come installare la PWA su Android e importare le impostazioni via QR.
  Segnala chiaramente i punti "da verificare" di docs/PROTOCOLLI-DANEA.md come cose da provare al
  primo collegamento.
- QR di setup: lo script `tenant:crea` (apps/bridge/scripts/tenant-crea.mjs) accetta anche
  `--url https://<dominio>` e, oltre a stampare le credenziali, salva `setup-<utente>.svg` con il
  QR del testo `terminalinobru://setup?url=...&token=...` (libreria `qrcode` solo in
  devDependencies del bridge, usata dallo script). Nel runbook: aprire l'SVG sul PC, inquadrarlo
  dal telefono con "Importa da QR", poi cancellare il file perché contiene il token. Niente
  endpoint HTTP per il QR: per chiamarlo servirebbe il token che il QR deve fornire.

Criteri di accettazione: il workflow di deploy è valido (usa `act` o almeno una validazione
sintattica) e non contiene segreti; il runbook è seguibile da chi non è sviluppatore.
```

## T10 — Collaudo con Easyfatt reale (dopo T14)

Modello: **Opus 5**, effort **high**. Branch `task/10-collaudo`. Lavoro assistito: il titolare
esegue i passi in Easyfatt e riporta gli esiti nella chat.

```
Guida il collaudo end-to-end con l'Easyfatt reale e correggi ciò che emerge. Procedi un passo alla
volta chiedendo l'esito prima di continuare.

1. Push del catalogo da Easyfatt al bridge di produzione. Se Easyfatt mostra un errore, chiedi il
   testo esatto e i log del worker (`wrangler tail`). Verifica su /api/stato il numero di prodotti
   e confrontalo con quello atteso; chiarisci il punto "solo prodotti spuntati per il sito".
2. Sync sul telefono e verifica di 5 prodotti a campione, con barcode.
3. Inventario di prova su 5 prodotti, export, import in Easyfatt come rettifica manuale su
   un archivio di prova o con causale riconoscibile; verifica dei movimenti generati. Chiarisci
   i punti "da verificare" sul separatore decimale, sui codici non trovati e sulla codifica.
4. DDT di prova con import da terminale e carico di prova.
5. Barcode sconosciuto abbinato in app, CSV, importazione in Easyfatt.
6. Prova con la rete spenta e con un lettore Bluetooth se disponibile.

Per ogni difetto: correggi in questo branch con test di regressione. Alla fine aggiorna
docs/PROTOCOLLI-DANEA.md sostituendo ogni "da verificare" con quanto osservato e aggiungi in
docs/DECISIONI.md le decisioni prese durante il collaudo.

Criteri di accettazione: tutti e sei i passi eseguiti con esito registrato nella PR; nessun
"da verificare" residuo senza risposta o senza motivazione.
```

## T11 — Guida utente

Modello: **Sonnet 5**, effort **low**. Branch `task/11-guida`.

```
Scrivi docs/GUIDA-UTENTE.md in italiano per chi usa l'app in magazzino e per chi importa in
Easyfatt: installazione su Android, prima configurazione via QR, sincronizzazione, le quattro
funzioni con passi numerati e il percorso esatto in Easyfatt per ogni import, cosa fare se un
barcode non viene riconosciuto, cosa fare senza rete, domande frequenti. Tono diretto, frasi
brevi, niente gergo. Aggiungi screenshot solo se già presenti in repo. Aggiorna README.md con lo
stato "in produzione" e i link.
```

## T12 — v2 libreria: ordini XML, parametri ricezione, clienti da export

Modello: **Opus 5**, effort **medium**. Branch `task/12-easyfatt-documenti`. Leggi anche
`docs/PROTOCOLLI-DANEA.md` (sezioni 3 e 4), `docs/MODELLO-DATI.md` (sezione 1) e
`docs/DECISIONI.md` (punti 52-55). Solo `packages/easyfatt` e `packages/core`.

```
Estendi le librerie per la v2 (DDT come ordini e-commerce), senza toccare bridge e PWA.

- core: tipi `ClienteDocumento`, `Cliente` e campi `cliente`, `numeroDocumento` di `Sessione` come in
  docs/MODELLO-DATI.md sezione 1, con schemi zod (partita IVA 11 cifre, codice fiscale 11 o 16
  caratteri, SDI 7 caratteri o PEC, provincia 2 lettere, email plausibile: tutti facoltativi ma
  validati se presenti) e `IMPOSTAZIONI_DEFAULT` invariato. Funzione pura `validaCliente` con
  messaggi in italiano.
- easyfatt, `generaDocumentiXml(documenti, opzioni)`: da documenti di dominio
  `{ numero, data (Date), cliente: ClienteDocumento, commento?, righe: {codice, descrizione?, quantita, um?}[] }`
  a `EasyfattDocuments AppVersion="2" Creator="TerminalinoBru"`, un `Document` per documento con
  `DocumentType` C, tutti i tag `Customer*` presenti nel cliente (`CustomerCode` solo se c'è il
  codice: per un cliente creato in app Easyfatt lo abbina per partita IVA, codice fiscale o
  email, altrimenti lo crea), `Date` yyyy-mm-dd, `Number`, `InternalComment`
  e `Rows/Row` con `Code`, `Description` (se presente), `Qty` (punto decimale, max 3 decimali,
  senza zeri inutili), `Um` (se presente). Niente `Price` (decisione 55); opzione
  `listino?: string` che, se passata, aggiunge `PriceList`. Escape XML corretto, dichiarazione
  UTF-8, CRLF non necessario. Sostituisce `generaDocumentiVuoto` (che resta per l'elenco vuoto).
- `analizzaParametriRicezione(query: Record<string,string|undefined>)`: legge `appver`,
  `firstdate`, `lastdate` (yyyy-mm-dd), `firstnum`, `lastnum` (interi ≥ 1); valori assenti →
  undefined, valori malformati → errore con messaggio in italiano (`ErroreRicezione`).
- `analizzaClientiTabella(righe: string[][])`: dalla tabella dell'export "Soggetti" di Easyfatt
  (prima riga = intestazioni, celle già come testo) ai `Cliente` con `origine: 'easyfatt'`.
  Intestazioni reali dell'export (2026-09-17): `Cod.`, `Codice fiscale`, `Partita Iva`,
  `Denominazione`, `Indirizzo`, `Cap`, `Città`, `Prov.`, `Regione`, `Nazione`,
  `Cod. destinatario Fatt. elettr.`, `Rif. ammin. Fatt. elettr.`, `Referente`, `Tel.`, `Cell`,
  `Fax`, `e-mail`, `Pec`, `Sconti`, `Listino`, e altre da ignorare. Abbinamento per nome
  normalizzato (minuscolo, senza accenti né punti) con sinonimi: codice (cod, codice, codice
  cliente), nome (denominazione, ragione sociale, nome, nominativo), partita iva, codice fiscale,
  indirizzo, cap, citta, prov/provincia, nazione, cod destinatario/sdi/codice destinatario,
  tel/telefono (se vuoto usa cell), e-mail/email, pec (se `sdi` vuoto e c'è la pec, `sdi` = pec),
  listino (numero 1-9 oppure "Listino N"). Partita IVA e codice fiscale numerici accorciati da
  Excel (zeri iniziali persi): se sono solo cifre e più corti di 11, riempi con zeri a sinistra.
  Restituisce `{ clienti, avvisi }`: righe senza codice o nome scartate con avviso, codici
  duplicati con avviso (vince l'ultima), colonne obbligatorie mancanti (codice, denominazione) →
  `ErroreTabellaClienti`. Righe interamente vuote ignorate (l'export ne ha centinaia).
- `leggiCsv(testo): string[][]` per il ripiego CSV (separatore `;` o `,` rilevato, virgolette,
  BOM, CRLF). La lettura dell'.xlsx sta nella PWA (T14), non qui.
- Fixture: `test/fixture/clienti-soggetti.csv` con le intestazioni reali sopra e 3 righe finte,
  più 2 varianti (colonne in ordine diverso e con sinonimi; colonna codice mancante).
- Test: copertura 100% come per il resto del pacchetto; un test confronta l'XML generato con una
  fixture attesa carattere per carattere.
```

Criteri di accettazione: `pnpm -r test` verde con copertura 100% su easyfatt; l'XML della fixture
è valido rispetto all'esempio Danea (sezione 4 di PROTOCOLLI-DANEA.md).

## T13 — v2 bridge: clienti, numerazione, ricezione documenti

Modello: **Sonnet 5**, effort **high**. Branch `task/13-bridge-documenti`. Leggi anche
`docs/PROTOCOLLI-DANEA.md` (sezione 3), `docs/MODELLO-DATI.md` (sezioni 2 e 4),
`docs/DECISIONI.md` (punti 52-62) e `apps/bridge/README.md`.

```
Porta il bridge alla v2: clienti, numerazione dei DDT e ricezione documenti da Easyfatt.

- Migrazione `0002_clienti_documenti.sql`: tabella `cliente`, colonne `cliente` (JSON di
  `ClienteDocumento`) e `numero_documento` su `sessione` con indice unico (tenant, numero),
  `tenant.prossimo_numero_documento` e `tenant.ultimo_clienti_il`. La migrazione assegna il numero
  anche alle sessioni `ddt` già presenti, in ordine di `ricevuta_il`, e porta il contatore oltre
  l'ultimo. Nella PR ricorda che in produzione le migrazioni si applicano dal PC
  (`wrangler d1 migrations apply DB --remote --env produzione`, docs/RUNBOOK.md sezione 4).
- `POST /api/clienti/importa` (Bearer, JSON `{ "clienti": Cliente[] }` già interpretato dalla
  PWA, validato con lo schema di core, max 2 MB, massimo 5000 clienti): upsert a blocchi e
  tombstone per gli assenti come il catalogo `full`, `ultimo_clienti_il` alla fine; risposta
  `{ importati, eliminati }`. `GET /api/clienti?dal=` con lo stesso schema del
  catalogo (cursore = `ultimo_clienti_il`).
- `POST /api/sessioni`: accetta `cliente` (validato con lo schema di core, obbligatorio per i
  `ddt`); per i `ddt` assegna
  `numero_documento` alla prima ricezione leggendo e incrementando
  `tenant.prossimo_numero_documento` nella stessa `db.batch`; un upsert successivo della stessa
  sessione non cambia il numero. Risposta con `numeroDocumento`. Elenco e dettaglio lo espongono.
- `DELETE /api/sessioni/:id` (Bearer): cancella sessione e righe; `204`; `409` se `esportata` o
  `importata` (Easyfatt l'ha già scaricata) con messaggio; `404` se non esiste.
- `GET /easyfatt/documenti` (Basic): `analizzaParametriRicezione`; risponde con
  `generaDocumentiXml` delle sessioni `ddt` non `aperta` del tenant con numero nell'intervallo
  `firstnum..lastnum` e data di chiusura in `firstdate..lastdate` (parametri assenti = nessun
  limite), cliente dal JSON della sessione, righe aggregate con `aggregaRighe` e descrizione
  presa da `prodotto`. Le sessioni
  servite per la prima volta passano a `esportata`; le sessioni con numero minore di `firstnum`
  ancora `esportata` passano a `importata` (decisione 53). Errori in testo puro, mai JSON.
  Registra nel log ogni richiesta con i parametri ricevuti (serve al collaudo).
- Test: tutti gli endpoint, numerazione stabile su rispedizione, concorrenza di due POST ddt
  (numeri diversi), filtri della ricezione, transizioni di stato, import clienti con tombstone.
- README del bridge aggiornato (tabella endpoint, come caricare i clienti con curl).
```

Criteri di accettazione: con due sessioni ddt caricate, `GET /easyfatt/documenti?appver=2`
restituisce due `Document` numerati 1 e 2 e le segna `esportata`; una seconda chiamata con
`firstnum=3` restituisce vuoto e le segna `importata`.

## T14 — v2 PWA: clienti, cliente nel DDT, Esportazioni

Modello: **Opus 5**, effort **high**. Branch `task/14-pwa-clienti`. Leggi anche
`docs/MODELLO-DATI.md` (sezioni 1, 3 e 4), `docs/ARCHITETTURA.md` sezione 3.3,
`docs/DECISIONI.md` (punti 52-62) e `docs/STILE.md` sezione 4.

```
Completa la v2 nella PWA.

- Dexie versione 2 con lo store `clienti`; la sync del catalogo scarica anche `/api/clienti?dal=`
  con il suo cursore (`cursoreClienti`), stesse regole del catalogo. Impostazioni e Home mostrano
  anche il numero di clienti.
- Nuova sessione di tipo DDT: campo "Cliente" obbligatorio con ricerca per nome, codice o partita
  IVA (indice in memoria come per i prodotti, massimo 30 risultati), scelta con un tocco, cliente
  mostrato nell'intestazione della sessione e nel riepilogo. Pulsante "Nuovo cliente" con modulo:
  ragione sociale (obbligatoria), partita IVA, codice fiscale, indirizzo, CAP, città, provincia,
  codice destinatario SDI, telefono, email, validati con `validaCliente`; salvato in Dexie con
  `origine: 'app'` e un UUID come id, subito scelto per la sessione. Nella sessione viaggia la
  copia completa (`Sessione.cliente`), così Easyfatt crea l'anagrafica al primo scarico. Al
  successivo import dell'export clienti, una voce creata in app con la stessa partita IVA o lo
  stesso codice fiscale viene sostituita da quella di Easyfatt. Se non ci sono clienti
  sincronizzati, messaggio che rimanda a Esportazioni > Clienti, ma "Nuovo cliente" funziona
  comunque.
- Sessione chiusa e Home: per i DDT mostra "Ordine n. <numeroDocumento>" appena il bridge lo
  assegna (dalla risposta del POST, salvato in Dexie) e lo stato (esportata = scaricato da
  Easyfatt, importata).
- Esportazioni (PC): sezione "Clienti" con caricamento del file esportato da Easyfatt (input
  file `.xlsx` o `.csv`). L'.xlsx si legge nel browser: `fflate` (unica dipendenza nuova,
  motivala nella PR) per aprire lo zip, poi `xl/sharedStrings.xml` e `xl/worksheets/sheet1.xml`
  letti con `DOMParser` (celle `t="s"` dalle stringhe condivise, `t="inlineStr"`, numeriche come
  testo senza notazione esponenziale); il CSV con `leggiCsv`. Poi `analizzaClientiTabella`,
  anteprima (quanti clienti, avvisi), conferma e `POST /api/clienti/importa` in JSON. Istruzioni:
  Easyfatt > Clienti > Esporta (Excel), senza filtri. Per le sessioni DDT il pulsante "Scarica terminale.txt" resta ma
  le istruzioni dicono che il DDT arriva con Strumenti > Scarica ordini da e-Commerce e poi
  "Genera da > DDT"; mostra il numero ordine nell'elenco.
- Cancellazione di una sessione già inviata: "Cancella sessione" chiama `DELETE /api/sessioni/:id`
  e, se il bridge risponde 204, cancella anche in locale; con 409 mostra il messaggio del bridge.
  Resta la cancellazione solo locale per aperte e chiuse non inviate (`inviataIl` assente).
- Test: ricerca clienti, sync clienti con fetch finto, validazione della nuova sessione DDT,
  cancellazione con fetch finto (204 e 409).
```

Criteri di accettazione: con clienti caricati dal PC, sul telefono si crea un DDT scegliendo il
cliente, si chiude, e in Esportazioni compare con il numero ordine; l'XML servito dal bridge
contiene quel cliente e quelle righe.

