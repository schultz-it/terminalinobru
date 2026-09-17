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
