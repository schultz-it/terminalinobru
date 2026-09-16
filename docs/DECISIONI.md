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
