# Decisioni di progetto

Registro delle scelte prese e del perché. Si aggiunge in coda, non si riscrive la storia.

## 2026-09-16 — Sessione di architettura iniziale

1. **Integrazione solo tramite formati ufficiali Danea.** File terminalino per inventario, DDT e carico; protocollo e-commerce per ricevere il catalogo; Easyfatt-XML per i documenti in v2. Nessun accesso diretto all'archivio. Motivo: robustezza, zero rischio sull'archivio, prodotto vendibile a qualsiasi utente Easyfatt Enterprise.
2. **Catalogo da Easyfatt, non da Shopify.** Verificato che lo store Shopify ha 178 prodotti, SKU uguali ai codici Easyfatt, ma zero barcode. Il push e-commerce di Easyfatt porta barcode, barcode aggiuntivi, listini, giacenze e ubicazioni. Shopify resta fuori dal progetto.
3. **PWA, non app nativa.** Installabile da Chrome, nessun store, un solo codice per telefono e PC. Se servirà lo store si valuterà Capacitor.
4. **Offline-first con Dexie.** In magazzino la rete non è garantita. Il bridge serve solo a sincronizzare.
5. **Bridge su Cloudflare Workers + D1**, che serve anche la PWA. HTTPS necessario per la fotocamera, costo zero, un solo dominio. Alternativa scartata: server in LAN sul PC di Easyfatt, per la complessità di HTTPS e certificati su Android.
6. **Multi-tenant fin dall'inizio nello schema**, ma senza gestione tenant in v1. Costa un campo per tabella oggi, evita una migrazione dolorosa se l'app verrà venduta.
7. **Nel file terminalino si scrive sempre il codice prodotto Easyfatt**, risolto sul telefono dal barcode. Funziona anche per prodotti senza barcode e per abbinamenti fatti in app.
8. **Stringa formato predefinita `A,Q` con decimali col punto.** È l'unica combinazione che la documentazione Danea descrive senza ambiguità. Resta configurabile.
9. **Quantità sempre digitate dall'utente.** Modalità predefinita "chiedi quantità"; la modalità "somma 1 per lettura" resta disponibile come opzione. Nessun moltiplicatore da barcode di confezione, anche se `PackageQty` viene parsato.
10. **Codici sconosciuti abbinabili in app**, con riserva: si valuta sul campo se la funzione è utile. Gli abbinamenti vengono esportati in CSV per riportarli in Easyfatt.
11. **Nessun agente Windows.** Easyfatt è in versione Enterprise One con archivio cloud, ma resta un programma Windows: il file si scarica dal browser del PC tramite la pagina Esportazioni dell'app.
12. **DDT in v1 solo con file terminalino**, cliente scelto in Easyfatt. In v2 cliente in app e DDT completo via polling e-commerce (`/easyfatt/documenti`), con verifica preliminare della deduplica.
13. **Lotti, scadenze e multi-magazzino** supportati nella libreria, assenti dalla UI. Azienda con un solo magazzino, senza tracciabilità lotti.
14. **Scanner: fotocamera come primario, lettori Bluetooth/USB in modalità tastiera come secondario.** L'API `BarcodeDetector` di Chrome Android con polyfill.
15. **Lingua italiana ovunque**, incluso codice e commit. Scelta del titolare.
16. **Slot e-commerce.** Easyfatt gestisce 3 siti, 2 già occupati: il bridge usa il terzo. Se in futuro servirà un altro sito, il bridge potrà fare da proxy verso altri sistemi.
17. **Workflow di sviluppo.** Ogni task in una chat Claude Code separata con modello ed effort indicati in `docs/TASK.md`; revisione e merge in una chat con Opus. Motivo: risparmio token e contesto pulito.

## 2026-09-17 — Revisione T02

18. **Listini assenti come `null`, non `NaN`.** Il modello dati iniziale diceva NaN; in revisione di T02 si è passati a `null` perché NaN sparisce in `JSON.stringify`, non passa uno schema zod `number` e non si confronta con se stesso. Con `null` la stessa forma vale in memoria, in D1 (colonne JSON) e nelle risposte API. Tipo `Prezzo = number | null` esportato da `core`.
19. **`easyfatt` dipende da `core` solo per i tipi.** Import `import type`, cancellato in compilazione: zod non entra nel bundle di `easyfatt`. Le due costanti condivise (numero listini, listini vuoti) sono ripetute in `easyfatt` con commento. Alternativa scartata: duplicare i tipi di dominio.
20. **Il separatore `§` nella stringa formato è letto come tabulazione**, come nella UI di Easyfatt. Da confermare in T10.
21. **`AppVersion` e `Mode` sono obbligatori nel catalogo**: se mancano il bridge risponde con un errore leggibile invece di assumere `full`. Da confermare in T10 che Easyfatt li invii sempre.
22. **Stile della PWA: pulito, con i colori del marchio.** Palette rilevata da imballaggibrunelli.it: giallo `#F2CE2E` primario, grafite `#313949` per i testi, nero per il logo e lo scanner, grigi neutri, tre colori semantici. Titoli in Montserrat come sul sito, testo in font di sistema per la velocità offline. Icona con la testa dello schnauzer del logo su fondo giallo. Dettagli in `docs/STILE.md`, loghi in `docs/brand/`.

## 2026-09-17 — T03

23. **Il marcatore dei prodotti ancora presenti è `aggiornato_il`.** Un invio del catalogo scrive lo stesso istante su tutte le righe che tocca; in modalità `full` ciò che non porta quell'istante riceve il tombstone con due sole `UPDATE`, invece di una `NOT IN` con migliaia di parametri o di una lettura completa della tabella per fare il diff. Conseguenza accettata: dopo un invio `full` il delta `GET /api/catalogo?dal=` restituisce tutto il catalogo, perché Easyfatt non dichiara quali prodotti siano davvero cambiati. Se diventerà un problema di banda, la strada è una colonna `visto_il` separata, non un diff in memoria.
24. **`tenant.ultimo_catalogo_il` è il marcatore di invio riuscito.** D1 non offre una transazione che copra più chiamate `batch`, quindi il catalogo si salva a blocchi di 50 statement (ognuno atomico) e la data si scrive solo alla fine: se un blocco fallisce, il tenant resta con la data precedente e l'errore è visibile in Easyfatt come frase in italiano.
25. **Il tenant si crea con uno script, non con una migrazione.** `docs/ARCHITETTURA.md` sezione 2.3 prevedeva un tenant creato da una migrazione con credenziali da secret; `pnpm --filter bridge tenant:crea` genera invece password e token casuali, ne salva solo gli hash SHA-256 e li stampa una volta sola. Motivo: una migrazione con dentro le credenziali finirebbe in repo o richiederebbe una migrazione diversa per ogni ambiente.
26. **Il cursore di sincronia della PWA è `ultimo_catalogo_il`, non l'orologio del bridge.** `GET /api/catalogo` restituisce in `aggiornatoIl` la data dell'ultimo invio riuscito del catalogo, e la PWA la rispedisce tale e quale come `dal`. Con l'orologio del momento, una sincronia eseguita durante un invio in corso avrebbe fissato un cursore posteriore alle righe di quell'invio, che non sarebbero più arrivate al telefono. Con l'ultimo invio riuscito il peggio che può succedere è riscaricare righe già viste. Deciso in revisione di T03.

## 2026-09-17 — Revisione T04

27. **Transizione `esportata → chiusa` ammessa.** Serve al pulsante "Riporta a chiusa" della pagina Esportazioni (T08): il file era stato scaricato ma non importato, e si vuole rifare l'export. Il bridge azzera `esportata_il`. Restano vietate le riaperture da `esportata` e da `importata` verso `aperta`.
28. **L'id di sessione è chiave globale ma il tenant proprietario è vincolante.** Un `POST /api/sessioni` con un id già usato da un altro tenant risponde 409 invece di sovrascrivere. Gli UUID rendono la collisione improbabile, ma l'isolamento fra tenant non deve dipendere dal caso.

## 2026-09-17 — T05

29. **Il cursore del catalogo vive in una chiave Dexie separata (`cursoreCatalogo`), fuori da `Impostazioni`.** L'utente non lo vede e non lo modifica; `ultimaSincronizzazione` resta l'orologio del telefono e serve solo alla regola delle 6 ore e alla data mostrata. Il testo di T05 in `TASK.md` parlava di "ultima sincronizzazione salvata": allineato al punto 26.
30. **Palette di Tailwind azzerata con `--color-*: initial`.** Una classe con un colore di Tailwind non produce CSS, quindi il vincolo di `STILE.md` ("solo i token del marchio") è verificato dal build e non solo a occhio.
31. **Titolo della barra superiore in `nero`.** `STILE.md` sezione 3 diceva "grafite", sezione 1 "su giallo il testo è sempre nero": vale la regola di contrasto, la sezione 3 è stata corretta.
32. **`zod` anche nella PWA, `fake-indexeddb` nei test.** Le risposte del bridge si validano con gli schemi di `core` prima di scriverle in Dexie: un bridge di versione diversa produce un messaggio, non dati corrotti. `fake-indexeddb` (solo dev) permette di provare Dexie sotto jsdom.
33. **Il criterio "Lighthouse PWA installabile" non è più misurabile.** Lighthouse 12 ha tolto la categoria PWA; l'installabilità si verifica con Chrome (`Page.getInstallabilityErrors` vuoto, manifest valido, service worker attivo) e si riportano le altre categorie.

## 2026-09-17 — T06

34. **L'anti-rimbalzo della fotocamera conta dall'ultimo avvistamento, non dall'ultima emissione.** Un codice fermo nell'inquadratura viene emesso una volta sola e torna leggibile dopo 1,5 s senza essere visto. Con il conteggio dall'emissione, in modalità "somma uno" (T07) un'etichetta lasciata davanti alla fotocamera avrebbe aggiunto una riga ogni 1,5 s. Deciso in revisione di T06.
35. **Il wasm del polyfill ZXing è servito dall'app, non dal CDN.** `barcode-detector` scaricherebbe `zxing_reader.wasm` da jsdelivr, e lo scanner deve funzionare offline. `zxing-wasm` è dipendenza diretta della PWA alla stessa versione esatta usata da `barcode-detector`, solo per importare l'URL del wasm; un test fallisce se le due versioni divergono. Costo: circa 1 MB in più nella precache, anche su Android dove il `BarcodeDetector` nativo rende il polyfill inutile.
36. **La risoluzione dei codici tollera lo zero iniziale.** Il `BarcodeDetector` restituisce un UPC-A come 12 cifre, mentre in Easyfatt lo stesso barcode può essere salvato come EAN-13 con lo zero davanti (o viceversa). Se il codice esatto non c'è, si prova la scrittura equivalente, solo per barcode numerici di 12 o 13 cifre. Deciso in revisione di T06.
37. **Il lettore in modalità tastiera è ascoltato solo mentre lo scanner è montato.** `ARCHITETTURA.md` parlava di un listener globale; il task T06 ha chiesto le tre sorgenti attive finché il componente è montato, così una raffica non finisce in una schermata che non sa cosa farne. La schermata sessione (T07) tiene lo scanner montato.

## 2026-09-17 — T07

38. **Quantità zero solo dopo un avviso, negativi mai.** Lo zero serve all'inventario (prodotto esaurito, "azzera giacenza"), quindi il tastierino lo accetta alla seconda conferma dopo l'avviso; le funzioni `aggiungiRiga` e `modificaQuantita` rifiutano i negativi e i non numeri.
39. **Una sessione vuota non si chiude.** Il bridge risponde 400 a una sessione senza righe, che resterebbe in coda per sempre con un errore: meglio bloccarla sul telefono con un messaggio.
40. **Un codice scritto a mano e sconosciuto apre la ricerca, non l'abbinamento.** Chi digita a mano di solito scrive una descrizione; da fotocamera e lettore un codice sconosciuto va invece al flusso "Abbina a un prodotto" con ritorno alla sessione (`?sessione=<id>`).
41. **Lo stato delle sessioni sul telefono si allinea al bridge in T08.** Il bridge è l'unica fonte di `esportata` e `importata` (le cambia il PC); dopo T07 sul telefono restano "chiusa". L'allineamento in sola lettura da `GET /api/sessioni` è stato aggiunto al testo di T08: rende utile la pulizia a 90 giorni e blocca, tramite `transizioneStato`, la riapertura di una sessione già esportata. Dal telefono si chiude solo una sessione `aperta`: la transizione `esportata → chiusa` resta al bridge.
42. **La coda fa un giro in più se qualcuno lo chiede durante un giro.** Un giro legge le voci all'inizio; una sessione chiusa mentre un'altra viaggia non sarebbe partita fino al prossimo avvio o al prossimo ritorno della rete. Deciso in revisione di T07.
43. **Una lettura con un foglio aperto viene scartata** con suono di errore e messaggio, invece di essere accodata: il magazziniere deve prima confermare o annullare la quantità che sta scrivendo.

## 2026-09-17 — T08

44. **L'allineamento degli stati salta le sessioni con un invio in coda.** Il bridge conosce ancora la versione precedente di una sessione riaperta e richiusa sul telefono: se l'allineamento prendesse il suo stato (`esportata`), la coda troverebbe la sessione non più `chiusa` e scarterebbe la richiusura senza spedirla. Lettura degli stati e scrittura avvengono nella stessa transazione Dexie. Deciso in revisione di T08.
45. **La pagina Esportazioni filtra sul telefono, non sul bridge.** `GET /api/sessioni` senza filtro e selezione degli stati lato client: l'elenco è piccolo (decine di sessioni) e cambiare filtro non fa chiamate.

## 2026-09-17 — Preparazione T09

46. **Il QR di setup lo produce lo script del tenant, non un endpoint.** Il testo di T09 prevedeva `GET /api/setup-qr` con auth app: per chiamarlo servirebbe già il token che il QR deve consegnare al telefono. Lo script `tenant:crea` è l'unico momento in cui il token esiste in chiaro, quindi salva lì anche l'SVG del QR, da cancellare dopo l'uso.

## 2026-09-17 — T09

47. **L'id del D1 di produzione non è nel repository.** `wrangler.toml` tiene un segnaposto nella sezione `[env.produzione]`; il workflow di deploy lo sostituisce dal secret `CLOUDFLARE_D1_DATABASE_ID` prima delle migrazioni e del deploy. Per questo lo script `tenant:crea --remote` non può usare il binding `DB`: passa a wrangler il nome del database (`terminalinobru`), che viene risolto dall'account. In locale resta il binding, che wrangler usa per trovare il file SQLite. Deciso in revisione di T09.
48. **Il deploy si avvia anche a mano.** `workflow_dispatch` sul workflow Deploy: il primo deploy avviene dopo aver impostato i secret, senza aspettare un altro merge su `main`.

## 2026-09-17 — Primo deploy

49. **Il deploy lo fa Cloudflare con la repository collegata, non GitHub Actions.** Andrea ha collegato la repo dalla dashboard: nessun secret da conservare su GitHub e una sola pagina da guardare. Il workflow `deploy.yml` resta come via di riserva, solo `workflow_dispatch`, così un push su `main` non pubblica due volte. Conseguenza: l'id del D1 di produzione sta in chiaro in `wrangler.toml` (non è un segreto: senza il token API non consente nulla, ed è la prassi documentata da Cloudflare) e le migrazioni D1 si applicano dal PC con `wrangler d1 migrations apply DB --remote --env produzione`, perché la build di Cloudflare non le esegue. Sostituisce la decisione 47: passare a wrangler il nome del database non basta, perché se `wrangler.toml` ha una voce con quel nome la usa comunque (con l'id segnaposto della sezione di sviluppo); lo script `tenant:crea --remote` usa quindi `--env produzione`.

## 2026-09-17 — Primo collaudo sul campo

50. **Ogni pulsante che scrive si blocca al primo tocco e mostra che sta lavorando.** Primo riscontro di Andrea in magazzino: con il telefono lento, due tocchi su "Aggiungi" nel foglio quantità creavano due righe. Il foglio ora aspetta la scrittura, disabilita tutti i tasti e scrive "Salvataggio…". Stessa regola già in vigore per "Abbina" e "Chiudi e invia", da applicare a ogni azione futura.
51. **La fotocamera va in pausa quando c'è una finestra aperta e non analizza più di metà del tempo.** Nella schermata sessione lo scanner resta montato; analizzare un fotogramma ogni 40 ms mentre si digita una quantità toglie processore all'interfaccia, soprattutto con il lettore software (wasm sul thread principale). Con `inPausa` l'analisi si sospende (la fotocamera resta accesa, riprende subito), e l'intervallo fra due analisi è almeno pari alla durata dell'ultima. Il suggerimento sotto la cornice dice "(lettura software)" quando il telefono non ha il BarcodeDetector nativo, per capirlo al volo durante il collaudo.

## 2026-09-17 — Cambio di rotta: DDT via ricezione ordini

52. **I DDT arrivano in Easyfatt come ordini e-commerce, non come file del terminalino.** Nell'installazione cloud di Imballaggi Brunelli "Importa da terminale portatile" non è disponibile (ticket Danea aperto). Il canale che Easyfatt fa da solo è "Strumenti > Scarica ordini da e-Commerce": il bridge risponde al polling con le sessioni DDT come ordini cliente (`DocumentType` C, documentato); il DDT lo genera Easyfatt con "Genera da". Inventario e carico restano sul file del terminalino finché Danea non risponde; `D` e `H` sul canale e-commerce sono da provare (T10). La v2 (ex T12) viene anticipata e divisa in T12 libreria, T13 bridge, T14 PWA.
53. **La deduplica è il numero del documento.** Easyfatt "propone sempre di scaricare partendo dall'ultimo ordine non ancora importato" e passa `firstnum`/`lastnum`: il bridge assegna a ogni sessione DDT un numero progressivo per tenant alla prima ricezione (`tenant.prossimo_numero_documento`, aggiornato nella stessa transazione), lo conserva anche se la sessione viene rispedita, e filtra la risposta con i parametri. Prima consegna → `esportata`; una richiesta con `firstnum` maggiore → le precedenti `importata`.
54. **I clienti arrivano da un CSV esportato da Easyfatt e caricato dal PC.** Il modulo e-commerce non spedisce l'anagrafica clienti. L'export "Clienti > Esporta" (salvato come CSV) si carica dalla pagina Esportazioni; il bridge lo tratta come catalogo `full` con tombstone e la PWA lo sincronizza insieme al catalogo. Colonne riconosciute per nome (codice, denominazione, partita IVA, codice fiscale, città, listino), con avvisi per quelle mancanti. Il documento porta `CustomerCode` e `CustomerName`: Easyfatt abbina per codice.
55. **Le righe dell'ordine portano codice, descrizione e quantità, non il prezzo.** Se Easyfatt applica il listino del cliente (eventualmente con `PriceList`), è il comportamento voluto; se mette zero, si aggiunge il prezzo del listino del cliente dal catalogo. Da verificare in T10 con il primo scarico reale.
56. **Un cliente nuovo si crea anche sul telefono, e viaggia dentro la sessione.** Richiesta di Andrea al primo collaudo. Il modulo chiede ragione sociale, partita IVA, codice fiscale, indirizzo, SDI, telefono ed email; il documento porta i tag `Customer*` senza `CustomerCode`, così Easyfatt abbina per partita IVA, codice fiscale o email oppure crea l'anagrafica. La sessione conserva la copia completa del cliente (`Sessione.cliente`, JSON sul bridge) invece del solo codice: il documento resta autosufficiente e il bridge non deve conoscere i clienti creati in app. Al prossimo export clienti, la voce creata in app con la stessa partita IVA o codice fiscale viene sostituita da quella ufficiale.
57. **Una sessione si cancella dal telefono solo finché il bridge non l'ha ricevuta.** Richiesta di Andrea al primo collaudo. Aperte e chiuse con invio in coda si cancellano con conferma; dopo una POST riuscita la coda annota `inviataIl` (campo locale, non spedito) e la cancellazione passa da `DELETE /api/sessioni/:id` (T13/T14), che il bridge rifiuta se Easyfatt ha già scaricato il documento. Altrimenti il PC vedrebbe una sessione che il telefono ha dimenticato.
58. **L'export clienti si carica com'è, in Excel, e lo legge il browser del PC.** Easyfatt esporta "Soggetti.xlsx", non un CSV; chiedere di convertirlo a ogni giro è un passo in più per chi non è sviluppatore. La PWA apre l'.xlsx con `fflate` e legge le due parti XML che servono, poi manda al bridge i clienti già interpretati in JSON: il bridge non deve conoscere formati di file. Intestazioni reali dell'export annotate nel testo di T12. Attenzione agli zeri iniziali di partita IVA e codice fiscale numerici, che Excel perde.

## 2026-09-17 — Revisione T12

59. **La partita IVA accetta anche quelle estere.** 11 cifre per l'Italia, oppure sigla del paese e numero (es. `DE123456789`), sempre in maiuscolo. Con la sola regola italiana il bridge (T13) avrebbe rifiutato i DDT dei clienti esteri importati da Easyfatt.
60. **Data del documento nel fuso `Europe/Rome`.** Il Worker gira in UTC: una sessione chiusa tra mezzanotte e le due avrebbe avuto la data del giorno prima. `generaDocumentiXml` accetta un fuso diverso per altri tenant.
61. **La PEC va in `CustomerEInvoiceDestCode` quando manca il codice destinatario.** È quanto dice il tracciato Danea per quel tag ("codice destinatario o PEC per fattura elettronica"); esiste anche `CustomerPec`, non usato.
62. **Lettura del file e interpretazione della tabella sono separate.** `leggiCsv` produce celle di testo, `analizzaClientiTabella` le interpreta: l'Excel di Easyfatt (T14) passa dalla stessa funzione. I numeri di riga negli avvisi sono quelli della tabella, cioè le righe di Excel, e le righe vuote (l'export ne ha centinaia) non contano.

## 2026-09-17 — Revisione T14

63. **Cancellare una sessione che il bridge non ha più cancella anche sul telefono.** `DELETE /api/sessioni/:id` con `404` (per esempio dopo una cancellazione dal PC o un ripristino del database) non è un errore per chi ha in mano il telefono: la sessione sparisce ovunque. Con `409` resta e si mostra il messaggio del bridge; senza rete resta e lo si dice. Il pulsante "Cancella sessione" compare solo per sessioni aperte o chiuse, perché dopo lo scarico di Easyfatt il bridge rifiuterebbe comunque. Un DDT senza cliente (aperto prima della v2) non si può chiudere finché non lo si sceglie.
64. **I branch non si pubblicano; le migrazioni si applicano prima del merge.** Durante la revisione di T13/T14 la produzione ha servito per qualche minuto il build del branch di T14 (Workers Builds pubblicava anche i branch) e, subito dopo il merge di T13, il codice nuovo senza la migrazione 0002 (ogni rotta autenticata rispondeva 500). Regola: nel dashboard Cloudflare i branch non di produzione usano solo `wrangler versions upload`; per una PR con migrazioni, Andrea applica la migrazione in produzione prima del merge (sono sempre additive, il codice vecchio le ignora). Vedi docs/RUNBOOK.md sezione 4.

