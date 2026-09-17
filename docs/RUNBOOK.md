# Runbook di configurazione

Guida passo passo per mettere TerminalinoBru in produzione e collegarlo a Easyfatt. Pensata per chi
non è sviluppatore: ogni passo dice dove cliccare e cosa copiare. Se un passo richiede la riga di
comando, il comando è pronto da incollare.

Per i problemi tecnici durante il collaudo (task T10) vedi la sezione 8, "Punti da verificare al
primo collegamento": sono le cose che la documentazione Danea lascia ambigue e che vanno provate
con l'Easyfatt reale.

## 1. Creare l'account Cloudflare

1. Vai su [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up) e crea un account
   gratuito (basta un'email).
2. Conferma l'email cliccando sul link che arriva.
3. Non serve aggiungere un dominio per iniziare: il Worker funziona anche sul sottodominio gratuito
   `*.workers.dev` (sezione 6 se in seguito vuoi un dominio tuo).

## 2. Creare il database D1

Il database (D1) è dove vivono catalogo, sessioni e credenziali. Va creato una volta sola.

1. Sul tuo computer, apri un terminale nella cartella del progetto TerminalinoBru ed esegui
   `pnpm install` (una volta sola, installa gli strumenti compreso `wrangler`).
2. Accedi a Cloudflare da riga di comando (si apre il browser per il login):

   ```bash
   pnpm --filter bridge exec wrangler login
   ```

3. Crea il database di produzione:

   ```bash
   pnpm --filter bridge exec wrangler d1 create terminalinobru
   ```

4. Il comando stampa un blocco con `database_id = "..."`. **Copia quella stringa**, serve al passo
   3 (va in un secret di GitHub, non si scrive nei file del progetto).

## 3. Impostare i secret in GitHub

I secret sono valori riservati che GitHub tiene al sicuro e passa solo al workflow di deploy, senza
mai comparire nel codice.

1. Vai sulla pagina del repository su GitHub.
2. **Settings > Secrets and variables > Actions > New repository secret**.
3. Crea questi tre secret:

   | Nome | Valore | Dove trovarlo |
   | --- | --- | --- |
   | `CLOUDFLARE_ACCOUNT_ID` | l'id del tuo account Cloudflare | Dashboard Cloudflare, barra laterale destra di qualsiasi pagina del tuo account, oppure `pnpm --filter bridge exec wrangler whoami` |
   | `CLOUDFLARE_API_TOKEN` | un token con permesso di modificare Worker e D1 | Dashboard Cloudflare > **My Profile > API Tokens > Create Token**, modello "Edit Cloudflare Workers" (aggiungi anche il permesso D1 Edit se non incluso) |
   | `CLOUDFLARE_D1_DATABASE_ID` | l'id copiato al passo 2 | output di `wrangler d1 create` |

Nessuno di questi tre valori va mai scritto in un file del progetto: solo qui, nei secret di
GitHub.

## 4. Primo deploy

Il deploy è automatico: **ogni volta che qualcosa viene unito nel branch `main`, GitHub Actions
compila il progetto e lo pubblica su Cloudflare da solo**, applicando prima le eventuali modifiche
al database. Non serve nessun comando manuale.

1. Dopo aver impostato i tre secret (sezione 3), vai su GitHub, scheda **Actions**, voce
   **Deploy** nell'elenco a sinistra.
2. Premi **Run workflow** (a destra), lascia `main` e conferma. Le esecuzioni precedenti in rosso
   sono normali: erano partite prima che i secret esistessero.
3. Il workflow è verde quando finisce: significa che il Worker `terminalinobru` è online.
4. Verifica aprendo `https://terminalinobru.<il-tuo-account>.workers.dev/api/salute` nel browser:
   deve rispondere `{"ok":true}`. L'indirizzo esatto lo trovi nella dashboard Cloudflare, sezione
   **Workers & Pages**, alla voce `terminalinobru`.

Se il workflow fallisce, apri il log del passo che è andato in rosso: di solito è un secret scritto
male (spazi, virgolette) o il token API senza il permesso D1.

## 5. Creare il tenant e conservare le credenziali

Il "tenant" è l'utenza che collega il tuo Easyfatt e il tuo telefono a questo database. Si crea una
volta sola con uno script, che genera password casuali e le mostra **una sola volta**.

1. Da terminale, nella cartella del progetto:

   ```bash
   pnpm --filter bridge tenant:crea -- --nome "Imballaggi Brunelli" --utente easyfatt --remote \
     --url https://terminalinobru.<il-tuo-account>.workers.dev
   ```

   (sostituisci l'indirizzo con il tuo dominio, se ne hai configurato uno alla sezione 6).

2. Lo script stampa **nome, id, utente, password Easyfatt e token app**. Copiali subito in un posto
   sicuro (un password manager, non un file di testo sulla scrivania): non si possono più
   rileggere. Se li perdi, si ripete questo passo con un nuovo utente.
3. Lo stesso comando salva anche un file `setup-easyfatt.svg` nella cartella `apps/bridge`: è un QR
   con dentro l'indirizzo del bridge e il token app, usato al passo 9 per configurare il telefono in
   pochi secondi invece di digitare tutto a mano. **Contiene il token in chiaro**: tienilo solo il
   tempo di inquadrarlo, poi cancellalo (vedi passo 9).

## 6. Dominio personalizzato (facoltativo)

Il sottodominio `workers.dev` funziona da subito e basta per iniziare. Se preferisci un indirizzo
tuo (es. `terminalinobru.tuodominio.it`):

1. Il dominio deve già essere su Cloudflare (**Websites > Add a site**, poi cambia i nameserver dal
   tuo registrar).
2. Dashboard Cloudflare > **Workers & Pages > terminalinobru > Settings > Domains & Routes > Add**,
   scegli il sottodominio.
3. Da quel momento usa quell'indirizzo ovunque in questa guida al posto di `*.workers.dev`,
   comprese le URL da inserire in Easyfatt (sezione 7).

## 7. Configurazione in Easyfatt

Fatto sul PC dove gira Easyfatt Enterprise (o Enterprise One): serve il modulo terminalini e il
modulo e-commerce.

### 7.1 Formato del file terminalino

**Opzioni > Moduli > Magazzino**: spunta "Utilizzo terminali portatili bar-code", stringa formato
file:

```
A,Q
```

Deve coincidere con quella impostata nella PWA (Impostazioni > Stringa formato): di norma non va
toccata, il valore di default dell'app è già `A,Q`.

### 7.2 Collegamento e-commerce

**Opzioni > Moduli > E-commerce**: scegli uno dei tre siti disponibili, tipo **"Sito personalizzato"
(terzo tipo)**, poi compila:

| Campo | Valore |
| --- | --- |
| URL aggiornamento prodotti | `https://<dominio>/easyfatt/catalogo` |
| URL ricezione ordini | `https://<dominio>/easyfatt/documenti` |
| Login | l'utente Easyfatt stampato dallo script (sezione 5) |
| Password | la password Easyfatt stampata dallo script (sezione 5) |

Sostituisci `<dominio>` con l'indirizzo del Worker (sezione 4) o il tuo dominio (sezione 6).

### 7.3 Lanciare l'aggiornamento prodotti

Nella stessa schermata E-commerce, pulsante **"Aggiorna prodotti e-commerce"** (o dal menu
principale, a seconda della versione: **Magazzino > E-commerce > Aggiorna prodotti**). Easyfatt
invia il catalogo al bridge e mostra un messaggio di esito: `OK` significa che il bridge ha ricevuto
e salvato tutto. Qualunque altro testo è un errore leggibile mostrato da Easyfatt stesso.

Ripeti questo passo ogni volta che prezzi o giacenze cambiano in modo significativo; la PWA lo
scarica da sola al massimo ogni 6 ore, o subito con "Sincronizza" nelle Impostazioni.

## 8. Punti da verificare al primo collegamento

`docs/PROTOCOLLI-DANEA.md` segnala alcuni comportamenti di Easyfatt non documentati con certezza.
Vanno osservati al primo aggiornamento prodotti e al primo import da terminale reali (task T10):

1. **Solo i prodotti spuntati per il sito vengono inviati?** In Easyfatt ogni prodotto ha una
   spunta "pubblica su questo sito e-commerce". Se dopo il primo "Aggiorna prodotti" il numero di
   prodotti su `/api/stato` è molto inferiore all'archivio, vanno spuntati in blocco per il sito
   scelto al passo 7.2 (selezione multipla prodotti > azione di gruppo).
2. **Codice del file terminalino non trovato in archivio**: verifica se Easyfatt scarta la riga con
   un avviso o blocca l'intero import. Se blocca, un barcode letto per errore in sessione rischia di
   bloccare l'intero export: da segnalare per una correzione.
3. **Codici prodotto con lettere accentate**: il file terminalino è UTF-8 senza BOM; verifica che
   Easyfatt lo legga correttamente se un codice prodotto contiene accenti.
4. **Messaggio di errore del catalogo con stato HTTP 400**: se Easyfatt mostra il messaggio
   d'errore del bridge solo quando la risposta ha stato 200 (e non con 400), va segnalato: il bridge
   dovrà rispondere sempre 200 con la frase d'errore nel corpo.
5. **Import da Excel dei codici a barre aggiuntivi**: quando riporti in Easyfatt i barcode abbinati
   in app (scaricabili da "Esportazioni > Barcode abbinati in app", colonna CSV `codice;barcode`),
   verifica se l'importazione prodotti da Excel accetta anche i codici a barre aggiuntivi o solo
   quello principale; in caso negativo vanno inseriti a mano in scheda prodotto.

Registra l'esito di ognuno di questi punti in `docs/PROTOCOLLI-DANEA.md`, sostituendo la dicitura
"da verificare" con quanto osservato (è il compito del task T10).

## 9. Installare la PWA su Android e importare le impostazioni via QR

1. Sul telefono Android, apri Chrome e vai su `https://<dominio>` (lo stesso indirizzo del Worker
   o del tuo dominio).
2. Chrome propone "Installa app" (o menu con i tre puntini > "Aggiungi a schermata Home" >
   "Installa"). Conferma: l'icona compare come un'app normale.
3. Apri l'app appena installata, vai in **Impostazioni > Importa da QR**.
4. Sul PC, apri il file `setup-easyfatt.svg` generato al passo 5 (doppio clic, si apre nel
   browser).
5. Sul telefono, inquadra lo schermo del PC con la fotocamera dello scanner dell'app: URL del
   bridge e token vengono compilati da soli.
6. Premi **"Verifica connessione"**: deve mostrare nome tenant, data ultimo catalogo e numero
   prodotti. Se il catalogo non è ancora stato inviato da Easyfatt (sezione 7.3), il numero sarà
   zero: è normale prima del primo aggiornamento prodotti.
7. Premi **"Sincronizza catalogo"** per scaricare i prodotti sul telefono.
8. **Cancella `setup-easyfatt.svg` dal PC**: contiene il token in chiaro e non serve più. Se serve
   configurare un secondo telefono, si può riaprire lo stesso file prima di cancellarlo, oppure
   rigenerarlo perdendo il vecchio (lo script non salva token vecchi in chiaro da nessuna parte).

A questo punto TerminalinoBru è pronto per l'uso quotidiano: consultazione prodotti, inventario,
DDT e carico come descritto in `docs/ARCHITETTURA.md` sezione 3.
