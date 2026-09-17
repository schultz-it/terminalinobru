# Guida utente

Guida per chi usa TerminalinoBru in magazzino (sul telefono) e per chi lavora in Danea Easyfatt sul
PC. Descrive come funziona l'app oggi (v2): i DDT arrivano in Easyfatt come ordini e-commerce, non
più come file del terminalino.

## 1. Installare l'app e configurarla con il QR

1. Sul telefono Android, apri Chrome e vai all'indirizzo del bridge (te lo dà chi ha fatto il
   deploy, per Imballaggi Brunelli `https://terminalinobru.andrea-93a.workers.dev`).
2. Chrome propone "Installa app" (oppure menu con i tre puntini > "Aggiungi a schermata Home" >
   "Installa"). Conferma: l'icona compare come un'app normale.
3. Apri l'app appena installata, vai in **Impostazioni** e premi **"Importa da QR"**.
4. Fatti mostrare sul PC il QR generato al momento della configurazione (file `.svg`, lo tiene chi
   ha creato l'utenza) e inquadralo: indirizzo del bridge e token vengono compilati da soli.
5. Premi **"Verifica connessione"**: deve mostrare "Connessione riuscita" con azienda, data
   dell'ultimo catalogo e numero di prodotti.
6. Premi **"Sincronizza catalogo e clienti"** per scaricare prodotti e clienti sul telefono.

**Dove si legge la versione**: in fondo a **Impostazioni** c'è una riga tipo "Versione 0.1.0 ·
build 1f0b0ea del 17/09/2026, 15:32". Se il telefono mostra una build diversa da quella che vedi sul
PC, vedi la domanda frequente in fondo a questa guida.

**Come si aggiorna l'app**: da sola. Basta riaprirla con la rete attiva: scarica in automatico
l'ultima versione pubblicata.

## 2. Sincronizzare catalogo e clienti

L'app scarica da sola prodotti, prezzi, giacenze e clienti dal bridge, al massimo ogni 6 ore, o
subito se premi **"Sincronizza ora"** in Home o **"Sincronizza catalogo e clienti"** in
Impostazioni.

- In Home, sotto lo stato di rete, trovi **"Ultima sincronizzazione: ..."** con data e ora
  dell'ultimo aggiornamento riuscito.
- Mentre è in corso, al posto della data compare **"Sincronizzazione in corso…"**.
- Se resta su "Sincronizzazione in corso…" per più di un minuto: la sincronizzazione si ferma da
  sola dopo un minuto con un messaggio d'errore leggibile (per esempio "Il bridge non ha risposto
  entro un minuto: controlla la connessione e riprova."). Se il messaggio non compare e la scritta
  resta ferma, chiudi del tutto l'app e riaprila: sblocca la situazione.

I clienti si aggiornano nello stesso modo, ma il primo elenco arriva solo dopo che qualcuno ha
caricato l'export da Easyfatt in **Esportazioni > Clienti** (sezione 6). Finché non è stato fatto,
la ricerca cliente nel DDT resta vuota, ma **"Nuovo cliente"** funziona comunque.

## 3. Consultare un prodotto

Per vedere prezzo, giacenza e ubicazione di un prodotto, senza aprire nessuna sessione:

1. Dalla Home premi **"Consulta prodotto"**: si apre la pagina **Consulta**.
2. Trova il prodotto in uno di questi tre modi:
   - **Fotocamera**: premi il pulsante giallo con l'icona del barcode accanto al campo di ricerca
     (si chiama "Scansiona") e inquadra il barcode.
   - **Lettore Bluetooth**: con il lettore collegato al telefono come tastiera, basta leggere il
     codice mentre lo scanner è aperto: viene riconosciuto da solo, senza toccare nulla.
   - **Codice scritto a mano**: nello scanner c'è il campo "Scrivi il codice" con il pulsante
     **"Cerca"**, oppure scrivi direttamente nel campo "Codice o descrizione" della pagina e tocca
     il prodotto nell'elenco.
3. Nella scheda prodotto trovi: descrizione, codice, "Prezzo listino" (netto e lordo) del listino
   scelto in Impostazioni, giacenza con la data di aggiornamento, ordinato, scorta minima,
   ubicazione, categoria, i "Barcode associati" e le note.

Se il codice letto non è riconosciuto, l'app apre **"Codice sconosciuto"**: vedi la sezione 7.

## 4. Fare un DDT

### Sul telefono

1. In Home premi **"Nuova sessione"**, scegli il tipo **"DDT"** (in Easyfatt arriva come ordine
   cliente).
2. Premi **"Scegli cliente"**: cerca per **nome, codice o partita IVA**. Se il cliente non è nel
   telefono (non è ancora arrivato l'export da Easyfatt, o è un cliente nuovo), premi **"Nuovo
   cliente"** e compila ragione sociale (obbligatoria), partita IVA, codice fiscale, indirizzo,
   CAP, città, provincia, codice destinatario SDI, telefono ed email. Questo cliente viaggia dentro
   la sessione: non serve che sia già in Easyfatt.
3. Dai un nome alla sessione (proposto in automatico), se vuoi delle note, e scegli la
   **"Modalità di scansione"**: **"Chiedi quantità"** (a ogni lettura digiti i pezzi) oppure
   **"Somma uno"** (ogni lettura aggiunge un pezzo). Poi premi **"Inizia sessione"**.
4. Leggi i prodotti con la fotocamera, il lettore Bluetooth o la ricerca; con "Chiedi quantità"
   digita i pezzi e premi **"Aggiungi"**. Per correggere una riga tocca la matita accanto alla
   riga, cambia la quantità e premi **"Salva"**.
5. Quando hai finito, premi **"Riepilogo e chiusura"**: vedi le righe aggregate per prodotto e il
   totale.
6. Premi **"Chiudi e invia"**: la sessione parte verso il bridge. Se il telefono è offline, resta
   "in attesa di invio" e riparte da sola alla prima connessione (o con **"Invia ora"**).
7. Appena il bridge risponde, sotto il nome della sessione compare **"Ordine n. <numero>"** e uno
   di questi stati:
   - **"In attesa dello scarico da Easyfatt"**: inviato, Easyfatt non l'ha ancora scaricato.
   - **"Scaricato da Easyfatt"**: Easyfatt l'ha ricevuto come ordine cliente.
   - **"Importato in Easyfatt"**: Easyfatt l'ha ricevuto una seconda volta (succede quando riscarica
     tutto l'anno): a questo punto è da considerare concluso.

### Sul PC, in Easyfatt

1. **Strumenti > Scarica ordini da e-Commerce**: Easyfatt scarica i DDT come ordini cliente. Il
   cliente è già abbinato (per codice, partita IVA, codice fiscale o email; se è un cliente creato
   sul telefono e sconosciuto a Easyfatt, viene creata l'anagrafica al volo).
2. Controlla l'ordine: righe con codice, descrizione e quantità corrette. Il prezzo non arriva
   dall'app: Easyfatt applica il listino che risulta in scheda cliente (di norma il listino 1 se il
   cliente non ne ha uno diverso impostato). Controllalo prima di procedere, soprattutto per un
   cliente con listino diverso da 1.
3. Dall'ordine, **"Genera da" > "DDT"**.
4. Salva il DDT: lo scarico di magazzino avviene al salvataggio.

Dopo il primo scarico la sessione sul telefono passa a "Scaricato da Easyfatt"; dopo il secondo
(quando Easyfatt riscarica l'intero anno) passa a "Importato in Easyfatt".

### Correggere o cancellare un DDT

- **Riaprire e correggere**: si può solo finché lo stato è "In attesa dello scarico da Easyfatt".
  Sul telefono, dalla sessione, **"Riapri sessione"**; correggi le righe e richiudi con **"Chiudi e
  invia"**: la sessione riparte con lo stesso numero d'ordine. Attenzione: Easyfatt scarta un
  numero che ha già ricevuto, quindi se nel frattempo qualcuno ha già premuto "Scarica ordini da
  e-Commerce" sul PC la correzione non arriva. Dopo lo scarico il pulsante "Riapri sessione" non
  compare più: correggi l'ordine o il DDT direttamente in Easyfatt.
- **Cancellare prima dello scarico**: **"Cancella sessione"** funziona finché Easyfatt non ha
  ancora scaricato l'ordine (stato "In attesa dello scarico da Easyfatt").
- **Cancellare dopo lo scarico**: se lo hai già scaricato in Easyfatt (stato "Scaricato da
  Easyfatt" o "Importato in Easyfatt"), il pulsante "Cancella sessione" non compare più: il bridge
  rifiuterebbe la richiesta perché Easyfatt lo ha già ricevuto. In quel caso correggi direttamente
  l'ordine o il DDT in Easyfatt.

## 5. Inventario e carico

1. In Home, **"Nuova sessione"**, scegli **"Inventario"** (per contare la giacenza) o **"Carico"**
   (merce in arrivo).
2. Leggi i prodotti e digita le quantità come per il DDT (per l'inventario vedi anche la giacenza
   teorica accanto a ogni lettura).
3. **"Riepilogo e chiusura"**, poi **"Chiudi e invia"**.

Sul PC, dalla pagina **Esportazioni**, trovi la sessione chiusa: premi **"Scarica terminale.txt"**
per scaricare il file (puoi controllarne il contenuto con **"Anteprima"** prima di importarlo).

In Easyfatt:

- **Inventario** → Magazzino > Movimenti > Rettifica > Rettifica manuale > Importa da terminale
  portatile, scegli il file appena scaricato. Causale predefinita "Rettifica giacenza". Se
  l'inventario è completo, usa anche "Azzera giacenza dei prodotti non in elenco". Easyfatt calcola
  da solo la differenza con la giacenza attuale.
- **Carico** → Nuovo Arrivo merce > Utilità > Importa da terminale portatile. Questo percorso non è
  ancora stato provato con un file dell'app (il collaudo ha coperto solo la rettifica manuale): alla
  prima volta controlla le righe prima di salvare.

Se un codice del file non esiste in archivio, Easyfatt non blocca l'import: scarta solo quella riga
e riepiloga qualcosa come "2 voci inserite, 1 voci non importate: riga 3 codice a barre
inesistente". Le altre righe entrano regolarmente.

Quando hai importato in Easyfatt, torna in **Esportazioni** sul telefono (o sul PC) e premi
**"Segna come importata"** sulla sessione: così sparisce dagli export da rifare e, dopo 90 giorni,
si può ripulire dal telefono.

## 6. Clienti

Il modulo e-commerce di Easyfatt non manda l'anagrafica clienti da solo: va esportata a mano ogni
volta che serve un aggiornamento (nuovi clienti, indirizzi o partite IVA cambiate).

1. In Easyfatt: **Clienti > Esporta**, formato Excel, **senza filtri** (l'intero elenco).
2. Sul PC, apri l'app nel browser, vai in **Esportazioni**, sezione **"Clienti"**, e premi
   **"Scegli il file dei clienti"**: seleziona il file appena esportato.
3. L'app mostra un'anteprima con il numero di clienti letti e gli eventuali avvisi; premi
   **"Conferma e carica sul bridge"**. I telefoni ricevono i clienti nuovi alla sincronizzazione
   successiva.

**Gli avvisi**: un avviso del tipo "Cliente ... campo ... non caricato. ... Va corretto in
Easyfatt." significa che quel singolo campo (per esempio una provincia scritta per esteso o
un'email incompleta) non rispetta il formato atteso e non è stato caricato: il resto del cliente
entra comunque. Correggi il campo direttamente in Easyfatt e rifai l'export quando ti è comodo; non
è urgente, non blocca l'uso dell'app.

**Perché un cliente creato sul telefono sparisce dopo l'export**: se hai creato un cliente nuovo
durante un DDT (sezione 4) e poi Easyfatt lo riceve come anagrafica ufficiale (con la stessa
partita IVA o lo stesso codice fiscale), al successivo caricamento dell'export clienti la voce
creata in app viene sostituita da quella ufficiale di Easyfatt. È normale: significa che
l'abbinamento è andato a buon fine, non hai perso il cliente.

## 7. Barcode non riconosciuto

Se leggi un codice che l'app non trova né tra i barcode né tra i codici prodotto, si apre
**"Codice sconosciuto"**:

1. Cerca il prodotto giusto per codice o descrizione (campo "Cerca il prodotto per codice o
   descrizione").
2. Scelto il prodotto, in **"Abbina a un prodotto"** premi **"Abbina"**: da questo momento quel
   barcode è riconosciuto anche sul telefono, e la lettura prosegue.
3. Se hai sbagliato prodotto, premi **"Scegli un altro prodotto"** prima di confermare.

Gli abbinamenti fatti in app sono in attesa di essere riportati in Easyfatt: in **Esportazioni**,
sezione **"Barcode abbinati in app"**, premi **"Scarica CSV"** per ottenere l'elenco (colonne
`codice;barcode`). Da lì puoi inserirli a mano in scheda prodotto in Easyfatt, campo "Cod. barre"
aggiuntivo.

Nota: non è stato ancora provato se l'importazione prodotti da Excel di Easyfatt accetta anche i
codici a barre aggiuntivi oltre a quello principale. Finché non viene verificato, considera valido
solo l'inserimento a mano in scheda prodotto.

## 8. Senza rete

Quasi tutto funziona anche offline:

- **Funziona senza rete**: letture di barcode, apertura e compilazione di sessioni (inventario,
  DDT, carico), consultazione prodotti già sincronizzati.
- **Aspetta la rete**: l'invio di una sessione chiusa (resta "in attesa di invio" e riparte da
  sola), la cancellazione di una sessione già inviata al bridge, e la sincronizzazione di catalogo
  e clienti.

L'indicatore in alto mostra **"Online"** o **"Offline"**.

Se il bridge non è raggiungibile e serve comunque portare i dati sul PC, usa **"Condividi file"**
nella schermata della sessione chiusa: genera il file del terminalino e lo condivide (o lo scarica) senza
passare dal bridge.

## 9. Domande frequenti

**Ho premuto due volte "Aggiungi".**
Il secondo tocco viene ignorato finché il primo non è salvato, quindi di norma non succede nulla.
Se la stessa etichetta è stata letta due volte, la riga compare due volte nella sessione ma nel
riepilogo le quantità dello stesso prodotto si sommano: tocca la matita accanto alla riga di
troppo, metti la quantità giusta (anche zero, confermando due volte) e premi "Salva".

**Ho premuto due volte "Inizia sessione" (o "Chiudi e invia").**
Non crea doppioni: il pulsante resta bloccato mentre lavora, e il rinvio della stessa sessione è un
aggiornamento (stesso id e stesso numero d'ordine), non una copia. Se hai il dubbio, controlla in
**Esportazioni** che ci sia una sola riga per quella sessione.

**Il DDT non compare in Easyfatt dopo "Strumenti > Scarica ordini da e-Commerce".**
Verifica prima lo stato sul telefono: deve essere almeno "In attesa dello scarico da Easyfatt" (cioè
inviato). Se è ancora "in attesa di invio", manca la rete o il bridge non è raggiungibile: controlla
la connessione e riprova con "Invia ora". Se è già "In attesa dello scarico da Easyfatt" ma non
arriva, controlla in Easyfatt l'intervallo di date e numeri proposto dalla finestra di scarico:
deve coprire l'anno in corso dal numero 1.

**Easyfatt dice "Stringa di formato non valida" anche se il campo sembra corretto.**
Cancella il campo Opzioni > Moduli > Magazzino > stringa formato e riscrivi a mano `A,Q`: spesso è
un carattere invisibile copiato per sbaglio, non un problema del file generato dall'app.

**Ho cancellato i dati del telefono (o disinstallato l'app).**
Le sessioni non ancora inviate si perdono. Reinstalla l'app (sezione 1), rifai l'importazione da
QR, sincronizza catalogo e clienti: tutto ciò che era già stato inviato al bridge resta comunque
visibile in Esportazioni sul PC.

**Il telefono mostra una versione diversa dal PC.**
Riapri l'app con la rete attiva: si aggiorna da sola all'ultima versione pubblicata. Se dopo la
riapertura la riga "Versione ... · build ..." in fondo a Impostazioni mostra ancora un commit
diverso da quello che vedi nel pannello di Cloudflare, segnalalo a chi gestisce il deploy.
