# TerminalinoBru

Terminalino barcode su Android per Danea Easyfatt, senza hardware dedicato.

Una PWA che gira nel browser del telefono, funziona offline in magazzino e produce esattamente
ciò che Easyfatt sa importare: il file di testo del terminale portatile e, in prospettiva,
documenti Easyfatt-XML. Il catalogo prodotti arriva sul telefono direttamente da Easyfatt tramite
la sua integrazione e-commerce.

## Funzioni

1. **Inventario**: scansiona, digita la giacenza rilevata, esporta, importa in Easyfatt come rettifica.
2. **DDT**: scansiona i colli in uscita, esporta, importa nel DDT in Easyfatt come scarico.
3. **Carico**: scansiona la merce in arrivo, importa nell'Arrivo merce in Easyfatt.
4. **Consultazione**: prezzi, giacenza, ubicazione di un prodotto da barcode, codice o descrizione.

## App

In produzione su `https://terminalinobru.andrea-93a.workers.dev`.

## Documentazione

| Documento | Contenuto |
| --- | --- |
| [Guida utente](docs/GUIDA-UTENTE.md) | Come usare l'app in magazzino e come portare i dati in Easyfatt. |
| [Runbook](docs/RUNBOOK.md) | Configurazione: Cloudflare, database, tenant, collegamento a Easyfatt. |
| [Architettura](docs/ARCHITETTURA.md) | Come è fatto il progetto e i flussi principali. |
| [Protocolli Danea Easyfatt](docs/PROTOCOLLI-DANEA.md) | Formati file e XML usati con Easyfatt. |
| [Modello dati](docs/MODELLO-DATI.md) | Tipi di dominio e schema del database. |
| [Decisioni di progetto](docs/DECISIONI.md) | Scelte prese e perché. |
| [Piano dei task](docs/TASK.md) | Avanzamento dei task di sviluppo. |
| [CLAUDE.md](CLAUDE.md) | Regole per chi sviluppa. |

## Stato

In produzione presso Imballaggi Brunelli. Vedi `docs/TASK.md` per l'avanzamento.

## Licenza

Software proprietario. Vedi [LICENSE](LICENSE).
