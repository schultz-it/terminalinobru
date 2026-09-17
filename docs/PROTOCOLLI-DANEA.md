# Protocolli Danea Easyfatt usati dal progetto

Raccolta di quanto verificato sulla documentazione pubblica Danea il 2026-09-16 e sul campo nel
collaudo con l'Easyfatt reale di Imballaggi Brunelli (task T10, 2026-09-17). I punti che la
documentazione lascia ambigui sono segnati **Collaudo T10** con quanto osservato, oppure **Non
verificato** con il motivo per cui non è stato provato.

Fonti:

- Blog terminalini: https://www.danea.it/blog/easyfatt-terminalini-portatili/
- Guida terminalini: https://help.danea.it/easyfatt/Uso_di_terminalini_portatili_con_lettore_di_codice_a_barre.htm
- Rettifica giacenze: https://help.danea.it/easyfatt/Rettifica_quantita_in_magazzino.htm
- Easyfatt-XML, note sul formato: https://www.danea.it/software/easyfatt/xml/formato/
- Easyfatt-XML, tracciato documenti: https://www.danea.it/software/easyfatt/xml/documenti/
- E-commerce, panoramica: https://www.danea.it/software/easyfatt/ecommerce/integrazione/
- E-commerce, autenticazione: https://www.danea.it/software/easyfatt/ecommerce/integrazione/autenticazione/
- E-commerce, invio catalogo: https://www.danea.it/software/easyfatt/ecommerce/integrazione/invio-prodotti/
- E-commerce, ricezione ordini: https://www.danea.it/software/easyfatt/ecommerce/integrazione/ricezione-ordini/
- E-commerce, versioni protocollo: https://www.danea.it/software/easyfatt/ecommerce/integrazione/versioni/

Requisiti lato Easyfatt: versione Enterprise (o Enterprise One) per terminalini ed e-commerce.
Il modulo e-commerce gestisce fino a 3 siti.

## 1. File del terminale portatile

### 1.1 Dove si configura

Opzioni > Moduli > Magazzino: spunta "terminali portatili bar-code" e stringa del formato file.
Il file è testo (`.txt` o `.csv`).

### 1.2 Stringa formato

Sequenza di caratteri che descrive ogni riga del file:

| Carattere | Significato |
| --- | --- |
| `A` | codice a barre **oppure** codice prodotto. Easyfatt cerca prima tra i barcode, poi tra i codici. |
| `Q` | quantità. Nel formato a spaziatura fissa è solo la parte intera. |
| `q` | parte decimale della quantità. Solo spaziatura fissa. |
| `L` | codice lotto o seriale. |
| `S` | data scadenza lotto. Formati accettati: `31/1/2023`, `2023/1/31`, `2023-1-31`, `31-1-2023`, `31012023`, `20230131`, `310123`. |
| `X` | valore da ignorare. |

Due famiglie di formato:

- **Campi delimitati**: le lettere sono separate da un carattere separatore, ad esempio `A;Q`, `A,Q`, `A§Q` (§ indica la tabulazione nella UI di Easyfatt), `A/Q/L/S`. Ogni riga del file è `codice<sep>quantità`.
- **Spaziatura fissa**: solo lettere, la posizione conta. `AAAAQQQqq` significa 4 caratteri di codice, 3 di quantità intera, 2 di decimali. **Non verificato**: convenzione di riempimento (zeri o spazi) per numeri e codici. Il progetto usa solo
il formato delimitato `A,Q`, quindi nel collaudo non è stato provato.

Regole sui decimali: se il separatore dei campi è la virgola, i decimali usano il punto.
**Non verificato**: con altri separatori Easyfatt accetta la virgola decimale, il punto, o entrambi; e
nemmeno, in pratica, una quantità decimale con `A,Q`. La prova di carico con 2,5 del collaudo T10 è
stata saltata dal titolare. Finché non serve un altro separatore vale la regola documentata.

**Collaudo T10**: Easyfatt accetta `A,Q`. Al primo tentativo la rettifica ha risposto "Stringa di
formato non valida: la stringa di formato per i file con separatore può contenere solo i caratteri
A, Q, L, S, X intervallati fra di loro da un separatore" con il campo che mostrava `A,Q`;
riscrivendo `A,Q` a mano l'import è andato. Quel messaggio indica un carattere invisibile o
diverso nel campo di Easyfatt (Opzioni > Moduli > Magazzino), non un problema del file. Con `A;Q` in
Easyfatt e il file a virgola ogni riga è scartata con "Linea con numero di campi differente dalla
stringa di formato".

Scelte del progetto (configurabili in app, devono coincidere con Easyfatt):

- Default `A,Q` con decimali col punto, perché è l'unica combinazione documentata senza ambiguità.
- Fine riga `\r\n`, codifica UTF-8 senza BOM. I codici prodotto sono ASCII in pratica; **non verificato** che Easyfatt legga UTF-8 se un codice ha caratteri accentati: i codici del catalogo reale sono ASCII (es. `+sca500350350`), quindi il caso non si presenta.
- Nel campo `A` l'app scrive sempre il **codice prodotto Easyfatt**, mai il barcode letto. La risoluzione barcode → codice avviene sul telefono. Così l'import funziona anche per prodotti senza barcode e per barcode abbinati in app non ancora riportati in Easyfatt.
- Una riga per prodotto, quantità sommate.

Esempio file con formato `A,Q`:

```
+banp_1200800p,17
+ban12008006a,172
FILM500,2.5
```

### 1.3 Dove si importa

| Operazione | Percorso in Easyfatt | Effetto |
| --- | --- | --- |
| Inventario | Magazzino > Movimenti > Rettifica > Rettifica manuale > Importa da terminale portatile | Rettifica: Easyfatt calcola il delta e crea i movimenti. Causale predefinita "Rettifica giacenza". Pulsante "Azzera giacenza dei prodotti non in elenco" per inventari completi. |
| DDT, fattura, ordine | Nuovo documento > righe > Utilità > Importa da terminale portatile | Righe aggiunte al documento con codice e quantità; il prezzo è quello di listino del cliente. Lo scarico avviene al salvataggio. |
| Arrivo merce | Nuovo Arrivo merce > Utilità > Importa da terminale portatile | Carico al salvataggio. |
| Movimento manuale | Magazzino > Movimenti > Carica / Scarica > Importa da terminale portatile | Carico o scarico secco senza documento. |

Comportamento noto della rettifica manuale: se un prodotto è inserito più volte la quantità
aumenta di 1 ad ogni lettura. Il nostro file è già aggregato, quindi non incide.

**Collaudo T10**: un codice del file non trovato in archivio **non blocca** l'import. Nella rettifica
manuale Easyfatt importa le altre righe e riepiloga "2 voci inserite, 1 voci non importate: riga 3
codice a barre inesistente".

**Collaudo T10**: nell'installazione cloud "Importa da terminale portatile" è disponibile, dopo la
risposta di Danea al ticket. È stato provato nella rettifica manuale; carico e arrivo merce non sono
stati provati.

## 2. Invio catalogo prodotti (e-commerce)

### 2.1 Trasporto

Easyfatt fa `POST` all'URL configurato con `Content-Type: multipart/form-data`, campo `file`
contenente l'XML. Autenticazione: Basic, NTLM o Digest del web server; in alternativa header
`HTTP_X_AUTHORIZATION` con `base64(login:password)`. Il bridge accetta Basic e anche questo
header per sicurezza.

Risposta attesa: corpo esattamente `OK` (prima riga). Righe successive opzionali
`ImageSendURL=...` e `ImageSendFinishURL=...` se si vogliono le immagini: noi non le chiediamo.
Qualsiasi corpo diverso da `OK` viene mostrato all'utente in Easyfatt come messaggio di errore,
quindi gli errori devono essere frasi leggibili. Il bridge risponde agli errori con stato HTTP 400
e corpo in testo puro. **Non verificato**: se Easyfatt mostra il corpo anche con stato 400 o solo con
200. Nel collaudo ogni invio del catalogo ha avuto esito `OK`, quindi un errore del bridge non si è
mai presentato; provocarlo apposta in produzione non è stato ritenuto utile. Se un giorno Easyfatt
mostra un errore generico invece della frase del bridge, il bridge dovrà rispondere 200 con la frase.

### 2.2 Struttura XML

```xml
<?xml version="1.0" encoding="UTF-8"?>
<EasyfattProducts AppVersion="2" Mode="full" Warehouse="Principale">
  <Products>
    <Product>
      <Code>+banp_1200800p</Code>
      <InternalID>1234</InternalID>
      <Barcode>8001234567890</Barcode>
      <Description>Bancale in plastica 1200x800</Description>
      <DescriptionHTML>...</DescriptionHTML>
      <Category>Bancali</Category>
      <Subcategory>Plastica</Subcategory>
      <Um>pz</Um>
      <NetPrice1>30.33</NetPrice1>
      <GrossPrice1>37.00</GrossPrice1>
      <Vat Perc="22" Class="Imponibile" Description="Aliquota 22%">22</Vat>
      <ManageWarehouse>true</ManageWarehouse>
      <WarehouseLocation>A-03</WarehouseLocation>
      <MinStock>10</MinStock>
      <AvailableQty>17</AvailableQty>
      <OrderedQty>0</OrderedQty>
      <SupplierCode>F001</SupplierCode>
      <SupplierName>Fornitore Srl</SupplierName>
      <SupplierProductCode>ABC</SupplierProductCode>
      <Notes>...</Notes>
      <CustomField1>...</CustomField1>
      <ImageFileName>foto.jpg</ImageFileName>
      <ExtraBarcodes>
        <Barcode>90273782</Barcode>
        <Barcode PackageQty="12">XY981</Barcode>
      </ExtraBarcodes>
      <Variants>
        <Variant>
          <Size>M</Size><Color>Blu</Color>
          <Barcode>0042/M/Blu</Barcode>
          <AvailableQty>23</AvailableQty>
        </Variant>
      </Variants>
    </Product>
  </Products>
</EasyfattProducts>
```

Attributi radice:

- `AppVersion`: `2` o `3` (il 3 sposta le varianti in `<Variants>`). Il protocollo 1 non è supportato.
- `Mode`: `full` (lista `<Products>`, tutto ciò che manca va considerato eliminato) oppure `incremental` (liste `<UpdatedProducts>` e `<DeletedProducts>`, i prodotti eliminati hanno solo `<Code>`).
- `Warehouse`: presente solo con più magazzini.

Campi che il progetto usa: `Code`, `Barcode`, `ExtraBarcodes/Barcode` (con `PackageQty` conservato ma
non usato), `Description`, `Category`, `Subcategory`, `Um`, `NetPrice1..9`, `GrossPrice1..9`,
`Vat@Perc`, `ManageWarehouse`, `WarehouseLocation`, `MinStock`, `AvailableQty`, `OrderedQty`,
`SupplierName`, `SupplierProductCode`, `Notes`. Tutto il resto viene ignorato senza errore.
I prodotti senza `Code` non vengono trasmessi da Easyfatt.

Le varianti taglia/colore vengono parsate (barcode e giacenza per variante) ma la UI v1 non le
gestisce: un barcode di variante risolve al prodotto padre.

Formato numeri: punto decimale, niente separatore migliaia. Date ISO `aaaa-mm-gg`. Codifica UTF-8.

Se con `Mode="full"` Easyfatt invia tutti i prodotti o solo quelli marcati "pubblica su
e-commerce" (in Easyfatt ogni prodotto ha la spunta per sito): **parzialmente verificato**. Prima del
collaudo T10 il push ha consegnato 548 prodotti, ma il numero non è stato confrontato con il totale
dell'archivio. Se un prodotto manca sul telefono, per
prima cosa controlla la spunta del sito.

## 3. Ricezione documenti (e-commerce, v2)

Verificato il 2026-09-17 sulle pagine Danea "Specifiche tecniche e-commerce: ricezione ordini",
"Tracciato Xml dei documenti", "Ricezione degli ordini di acquisto" e "Importazione dei documenti".

Easyfatt fa `GET` all'URL configurato con parametri `appver=2` e, opzionali, `firstdate`,
`lastdate` (`yyyy-mm-dd`), `firstnum`, `lastnum`. Stessa autenticazione del punto 2. La risposta è
un `EasyfattDocuments` (esempio nella sezione 4). In Easyfatt si lancia da **Strumenti > Scarica
ordini da e-Commerce**, in automatico dall'URL o a mano da file; secondo la documentazione il
programma "propone sempre di scaricare partendo dall'ultimo ordine non ancora importato": la
deduplica è affidata al **numero del documento** (`Number`), che quindi deve essere progressivo e
stabile per ogni documento, e il bridge deve rispettare `firstnum`/`lastnum` (e
`firstdate`/`lastdate`) nella risposta.

**Collaudo T10**: la finestra di scarico propone numero e date, e con i valori proposti Easyfatt
chiama **sempre** `?appver=2&firstdate=2026-01-01&lastdate=2026-12-31&firstnum=1`, cioè l'anno
intero dal numero 1, senza `lastnum`, anche dopo aver importato degli ordini. I doppioni li scarta
Easyfatt da solo: al secondo scarico nessun ordine nuovo, e un DDT riaperto e richiuso sul telefono
(stesso numero) arriva una volta sola. Quindi il bridge non può capire da `firstnum` cosa è stato
importato (docs/DECISIONI.md punto 68), e ogni risposta contiene tutti i DDT dell'anno.

Gli ordini scaricati diventano **ordini cliente**; da lì "Genera da" produce DDT, fattura o
ricevuta. Il cliente viene abbinato così: prima `CustomerCode` (o `CustomerWebLogin`), poi
codice fiscale, partita IVA o e-mail; se nulla corrisponde viene creato un nuovo cliente.
**Collaudo T10**: un ordine con `CustomerCode` di un cliente esistente si abbina a quel cliente
senza doppioni. Un ordine senza `CustomerCode` per una partita IVA sconosciuta crea l'anagrafica
con indirizzo, CAP, città, provincia, partita IVA, codice fiscale, SDI o PEC
(`CustomerEInvoiceDestCode`), telefono ed email nei campi giusti.

`DocumentType`: se omesso vale `C` (ordine cliente). Il tracciato ammette A, B, C, D, E, F, G, H,
I, J, L, M, N, O, P, Q, R, S, ma la ricezione e-commerce è pensata per `C`. **Non verificato**: se il
canale accetta anche `D` (DDT diretto) e `H` (arrivo merce). Nel collaudo T10 non è stato provato:
serviva un archivio di prova, e dopo la risposta di Danea il carico passa dal file del terminalino.
In v2 si usa `C` e il DDT lo genera Easyfatt con "Genera da", che è documentato.

Tag utili del `Document`: `CustomerCode`, `CustomerName`, `Date`, `Number`, `Numbering`,
`Warehouse`, `PriceList` (denominazione del listino), `InternalComment`, `CustomField1-4`. Tag di
`Row`: `Code`, `Description`, `Qty`, `Um`, `Price`, `Discounts`, `VatCode`, `Notes`, `Stock`.
Nessun tag è dichiarato obbligatorio.

**Collaudo T10**: con `Price` omesso Easyfatt **non** mette zero: nell'ordine le righe hanno il prezzo
del listino 1. Il cliente della prova aveva il listino 1 in scheda, quindi non si può ancora dire se
Easyfatt applichi il listino del cliente o sempre il listino 1. Il titolare ha deciso di non
intervenire (docs/DECISIONI.md punto 69). Non verificati: se `PriceList` forza il listino (il
bridge non lo manda), se una `Description` omessa viene presa dall'archivio (il bridge la manda
sempre, dal catalogo) e cosa fa Easyfatt con un `Code` non in archivio dentro un ordine. Dal
telefono quest'ultimo caso non si può produrre, perché le righe nascono solo da prodotti del
catalogo, e la prova con un file costruito a mano è stata saltata dal titolare.

Vincolo emerso sul campo (2026-09-17): nell'installazione di Imballaggi Brunelli (Easyfatt in
cloud) l'importazione da terminale portatile non era disponibile, ticket aperto con Danea. Per
questo i DDT passano da questo canale (v2). Durante il collaudo T10 Danea ha risposto e
l'importazione da terminale funziona (sezione 1.3): inventario e carico usano il file, i DDT restano
su questo canale, che porta cliente e numero.

## 4. Easyfatt-XML documenti (v2)

Struttura: `EasyfattDocuments` > `Company` (opzionale) > `Documents` > `Document` > `Rows` > `Row`,
più `Payments`. Import manuale da Documenti > Utilità > Importa documenti Easyfatt-XML, oppure via
polling e-commerce.

Codici `DocumentType`: A avviso di parcella, B vendita al banco, C ordine cliente (default),
D documento di trasporto, E ordine fornitore, F fattura accompagnatoria, G rapporto d'intervento,
H arrivo merce fornitore, I fattura, J fattura d'acconto, L pro-forma, M autofattura,
N nota di credito, O nota di addebito, P parcella, Q preventivo, R ricevuta fiscale, S preventivo fornitore.

Tag utili di `Document`: `DocumentType`, `Date` (yyyy-mm-dd), `Number`, `Numbering`, i tag del
cliente `CustomerCode`, `CustomerWebLogin`, `CustomerName`, `CustomerAddress`, `CustomerPostcode`,
`CustomerCity`, `CustomerProvince` (2 lettere), `CustomerCountry`, `CustomerFiscalCode`,
`CustomerVatCode`, `CustomerEInvoiceDestCode` ("codice destinatario o PEC per fattura
elettronica"), `CustomerTel`, `CustomerCellPhone`, `CustomerFax`, `CustomerEmail`, `CustomerPec`,
`CustomerReference`; consegna `Delivery*`; `Carrier`, `TransportReason`, `GoodsAppearance`,
`NumOfPieces`, `TransportDateTime`, `Warehouse`, `PriceList` (denominazione del listino),
`InternalComment`, `CustomField1-4`. Nessun tag è obbligatorio. `Number`: nell'importazione
manuale Easyfatt assegna il numero; nella ricezione e-commerce è il numero dell'ordine web, usato
per `firstnum`/`lastnum`.

Esempio Danea, ridotto ai tag che usiamo (i valori sono quelli della pagina Danea):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<EasyfattDocuments AppVersion="2" Creator="Danea Soft" CreatorUrl="www.danea.it">
  <Documents>
    <Document>
      <DocumentType>C</DocumentType>
      <CustomerCode>0018</CustomerCode>
      <CustomerName>Ceramiche Italiane</CustomerName>
      <CustomerAddress>Via Flaminia, 963</CustomerAddress>
      <CustomerPostcode>06061</CustomerPostcode>
      <CustomerCity>Castiglione Del Lago</CustomerCity>
      <CustomerProvince>PG</CustomerProvince>
      <CustomerCountry>Italia</CustomerCountry>
      <CustomerVatCode>03322350178</CustomerVatCode>
      <CustomerTel>075-26589</CustomerTel>
      <CustomerEmail>italianceramiche@ceramiche.it</CustomerEmail>
      <Date>2010-03-23</Date>
      <Number>2</Number>
      <InternalComment>Nessun Acconto</InternalComment>
      <Rows>
        <Row>
          <Code>0043</Code>
          <Description>Appendiabiti su ruote</Description>
          <Qty>1</Qty>
          <Um>pz</Um>
          <Price>162</Price>
          <VatCode Perc="20" Class="Imponibile" Description="Aliquota 20%">20</VatCode>
        </Row>
      </Rows>
    </Document>
  </Documents>
</EasyfattDocuments>
```

Tag di `Row`: `Code`, `Description`, `Qty`, `Um`, `Price`, `Discounts`, `VatCode`, `Lot`,
`ExpiryDate`, `Serial`, `Stock` (true per movimentare il magazzino), `Notes`.

Regole: tag omesso = valore di default (data odierna, numero automatico); tag vuoto = valore nullo.
In importazione si può ignorare `CustomerCode` e abbinare per nome.

Non esiste un tipo documento per la rettifica di inventario: l'inventario resta sul file del terminale.

## 5. Importazione prodotti da Excel (per riportare i barcode abbinati in app)

Easyfatt importa prodotti da foglio Excel con colonne corrispondenti ai campi; "Cod. barre" è tra
queste e l'import aggiorna i prodotti esistenti per codice. **Non verificato** se l'import da Excel
supporta anche i codici a barre aggiuntivi: il passo 6 del collaudo T10 (abbinamento in app, CSV,
importazione) è stato saltato dal titolare. Oggi il catalogo ha solo 2 prodotti con barcode, e in
entrambi il campo contiene il codice prodotto, quindi la funzione non è ancora in uso. Finché non
viene provato, i barcode extra vanno inseriti a mano nella scheda prodotto. Il bridge espone comunque il CSV degli abbinamenti.
