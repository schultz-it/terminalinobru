# Guida di stile della PWA

Stile pulito, colori del marchio Imballaggi Brunelli (rilevati il 2026-09-17 da imballaggibrunelli.it
e dai loghi in `docs/brand/`). Ogni schermata deve restare leggibile in magazzino, con una mano sola
e alla luce forte: pochi colori, contrasto alto, testi grandi, target di tocco ampi.

## 1. Palette

| Nome token | Valore | Uso |
| --- | --- | --- |
| `giallo` | `#F2CE2E` | Colore primario del marchio. Barra superiore, pulsante principale, voce attiva della barra inferiore, evidenziazioni, `theme_color` del manifest. |
| `giallo-scuro` | `#D9B41A` | Stato premuto o hover del giallo, bordo di elementi gialli. |
| `giallo-chiaro` | `#FBF3CC` | Sfondo di avvisi e righe evidenziate. |
| `nero` | `#141414` | Testo su giallo, logo, schermata scanner. |
| `grafite` | `#313949` | Titoli e testo principale su bianco. |
| `grigio-testo` | `#666666` | Testo secondario, etichette. |
| `grigio-bordo` | `#C0C6CC` | Bordi di campi e card, divisori. |
| `grigio-sfondo` | `#F4F4F4` | Sfondo di pagina. |
| `bianco` | `#FFFFFF` | Card, campi, barra inferiore. |
| `verde` | `#1E8E3E` | Esito positivo: codice trovato, sessione inviata. |
| `rosso` | `#D93025` | Errore, codice sconosciuto, azioni distruttive. |
| `arancio` | `#E8710A` | Avviso: offline, catalogo vecchio, coda in attesa. |

Regole di contrasto:

- Su `giallo` il testo è sempre `nero`. Mai testo bianco su giallo: non passa il contrasto.
- Su `nero` (scanner) il testo è bianco e la cornice guida è `giallo`.
- Su `bianco` e `grigio-sfondo` il testo è `grafite`, il secondario `grigio-testo`.
- I colori semantici si usano su sfondo bianco o come sfondo pieno con testo bianco, mai su giallo.

Tailwind v4, in `apps/pwa/src/stile.css`:

```css
@import 'tailwindcss';

@theme {
  --color-giallo: #f2ce2e;
  --color-giallo-scuro: #d9b41a;
  --color-giallo-chiaro: #fbf3cc;
  --color-nero: #141414;
  --color-grafite: #313949;
  --color-grigio-testo: #666666;
  --color-grigio-bordo: #c0c6cc;
  --color-grigio-sfondo: #f4f4f4;
  --color-verde: #1e8e3e;
  --color-rosso: #d93025;
  --color-arancio: #e8710a;
  --font-titolo: 'Montserrat Variable', system-ui, sans-serif;
  --font-testo: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
}
```

Non usare i colori di Tailwind (`slate`, `teal`, ecc.) nelle schermate: solo i token sopra.

## 2. Tipografia

- **Titoli**: Montserrat, peso 700, maiuscolo con spaziatura leggera per i titoli di schermata
  (come sul sito). Self-hosted con `@fontsource-variable/montserrat`, così funziona offline.
- **Testo**: font di sistema. Niente Open Sans caricato: in magazzino conta la velocità.
- **Numeri**: quantità, prezzi e giacenze con `tabular-nums`, dimensione grande (almeno 24 px per la
  quantità corrente, 40 px o più nel tastierino).
- Dimensione minima del testo 16 px. Etichette secondarie 14 px, mai sotto.

## 3. Struttura delle schermate

- **Barra superiore** gialla, alta 56 px: titolo della schermata in grafite, a sinistra il pulsante
  indietro quando serve, a destra al massimo un'azione.
- **Barra inferiore** bianca con bordo superiore `grigio-bordo`, 4 voci: Home, Consulta,
  Esportazioni, Impostazioni. Icona più etichetta; la voce attiva è in `nero` con sfondo `giallo`
  arrotondato dietro l'icona.
- **Contenuto** su `grigio-sfondo`, card bianche con angoli arrotondati 12 px e bordo
  `grigio-bordo`, niente ombre pesanti.
- **Scanner** a schermo intero su `nero`, cornice guida `giallo`, pulsanti torcia e chiudi bianchi.
- **Tastierino quantità**: foglio dal basso, bianco, tasti alti almeno 56 px, tasto conferma
  `giallo` a tutta larghezza.

## 4. Componenti

| Componente | Aspetto |
| --- | --- |
| Pulsante primario | Sfondo `giallo`, testo `nero`, peso 700, altezza 48 px, angoli 10 px. Premuto: `giallo-scuro`. |
| Pulsante secondario | Sfondo bianco, bordo `grigio-bordo`, testo `grafite`. |
| Pulsante distruttivo | Sfondo bianco, bordo e testo `rosso`. Sempre con conferma. |
| Campo di testo | Bianco, bordo `grigio-bordo`, focus con bordo `giallo-scuro` a 2 px. Altezza 48 px. |
| Chip di stato sessione | `aperta` giallo-chiaro con testo grafite, `chiusa` grigio, `esportata` arancio chiaro, `importata` verde chiaro. |
| Avviso | Barra piena a tutta larghezza: `arancio` per offline e coda, `rosso` per errori, `verde` per conferme. Testo bianco. |
| Riga prodotto | Codice in Montserrat 700, descrizione sotto in testo normale, quantità a destra grande e tabulare. |

Icone: `lucide-react`, tratto 2 px, dimensione 24 px nelle liste e 28 px nella barra inferiore.

## 5. Icona e manifest

- Icona: quadrato `giallo` con angoli arrotondati e la testa nera dello schnauzer ritagliata da
  `docs/brand/logo-imballare.png` (è la mascotte del marchio). Versione maskable con la testa dentro
  la zona sicura centrale dell'80%. Formati 192 e 512 px, PNG.
- `theme_color` `#F2CE2E`, `background_color` `#F4F4F4`, nome "TerminalinoBru".
- Il logo "imballare.net" compare solo nella schermata Impostazioni, in fondo, in piccolo.
  Non va ripetuto nelle schermate di lavoro.

## 6. Accessibilità e tocco

- Ogni elemento toccabile almeno 48 × 48 px, con 8 px di distanza dal vicino.
- Contrasto minimo 4.5:1 per il testo. La palette sopra lo rispetta nelle combinazioni indicate.
- Feedback di scansione anche non visivo: suono e vibrazione, con impostazioni per disattivarli.
- Niente tema scuro in v1, salvo la schermata scanner.
