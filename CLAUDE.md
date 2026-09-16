# TerminalinoBru

App PWA per Android che emula un terminalino barcode e dialoga con Danea Easyfatt
(inventario, DDT, carico merce, consultazione prezzi e disponibilità).

## Regole per chi lavora in questa repo

- **Lingua: italiano ovunque.** Codice, nomi di variabili di dominio, commenti, commit, PR, documentazione.
  I termini tecnici standard restano in inglese (handler, fetch, service worker, upsert).
- **Prima di iniziare un task** leggi, nell'ordine: questo file, `docs/ARCHITETTURA.md`, la sezione del
  tuo task in `docs/TASK.md`. Leggi `docs/PROTOCOLLI-DANEA.md` e `docs/MODELLO-DATI.md` solo se il task li cita.
  Non rileggere altro per risparmiare contesto.
- **Un task = un branch = una PR.** Branch `task/NN-nome-breve`, PR verso `main`, squash merge.
  Il merge lo fa la chat di revisione, non la chat che implementa.
- **Non cambiare l'architettura** senza aggiornare `docs/DECISIONI.md` e segnalarlo nella PR.
- **Niente segreti in repo.** Token, password, URL privati vanno in `.dev.vars` (ignorato) o nei secret di Cloudflare/GitHub.
- **Test obbligatori** per `packages/easyfatt` (copertura completa) e per gli endpoint del bridge.
  Per la PWA bastano test sulle funzioni pure (aggregazione righe, ricerca, parsing input lettore).
- **Dipendenze minime.** Aggiungi una libreria solo se scritto nel task o se davvero necessaria; motivalo nella PR.
- **A fine task** riporta nella descrizione della PR: cosa hai fatto, cosa non hai potuto verificare, comandi eseguiti.
- **Stato dei task:** aggiorna la tabella in `docs/TASK.md` solo nella chat di revisione, dopo il merge.

## Stack

- Monorepo `pnpm` + TypeScript strict. Node 22.
- `packages/core`: tipi di dominio e funzioni pure (zod per validazione).
- `packages/easyfatt`: protocolli Danea (parser catalogo XML, generatore file terminalino, generatore Easyfatt-XML). Unica dipendenza di runtime `fast-xml-parser`; da `core` importa solo tipi (`import type`), mai codice.
- `apps/bridge`: Cloudflare Worker con Hono + D1 (SQLite). Serve anche la PWA compilata come asset statici.
- `apps/pwa`: Vite + React + TypeScript + Tailwind, Dexie (IndexedDB), `vite-plugin-pwa`, `barcode-detector` (polyfill di BarcodeDetector).
- Test: Vitest (`@cloudflare/vitest-pool-workers` per il bridge). Lint: ESLint + Prettier.

## Comandi

```bash
pnpm install
pnpm -r typecheck
pnpm -r lint
pnpm -r test
pnpm -r build
pnpm --filter bridge dev      # worker locale con D1 locale, serve anche la PWA
pnpm --filter pwa dev         # solo frontend, proxy /api verso il worker
```

## Struttura

```
apps/bridge/      worker Hono + D1, migrazioni in apps/bridge/migrations
apps/pwa/         PWA React
packages/core/    tipi e logica pura condivisa
packages/easyfatt protocolli Danea
docs/             architettura, protocolli, modello dati, decisioni, task
```
