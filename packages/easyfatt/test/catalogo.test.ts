import { describe, expect, it } from 'vitest';
import { analizzaCatalogo, ErroreCatalogo } from '../src/index.js';
import catalogoFullV2 from './fixture/catalogo-full-v2.xml?raw';
import catalogoFullV3 from './fixture/catalogo-full-v3-varianti.xml?raw';
import catalogoIncremental from './fixture/catalogo-incremental.xml?raw';
import catalogoMalformato from './fixture/catalogo-malformato.xml?raw';

const ISTANTE = '2026-09-16T12:00:00.000Z';
const opzioni = { aggiornatoIl: ISTANTE };

describe('analizzaCatalogo, full protocollo 2', () => {
  const catalogo = analizzaCatalogo(catalogoFullV2, opzioni);

  it('legge modalità e magazzino', () => {
    expect(catalogo.modalita).toBe('full');
    expect(catalogo.magazzino).toBe('Principale');
    expect(catalogo.codiciEliminati).toEqual([]);
  });

  it('legge i tre prodotti nell ordine del file', () => {
    expect(catalogo.prodotti.map((p) => p.codice)).toEqual([
      '+banp_1200800p',
      'FILM500',
      'SCAT-30',
    ]);
  });

  it('riempie tutti i campi usati dal progetto', () => {
    expect(catalogo.prodotti[0]).toEqual({
      codice: '+banp_1200800p',
      descrizione: 'Bancale in plastica 1200x800',
      categoria: 'Bancali',
      sottocategoria: 'Plastica',
      um: 'pz',
      prezziNetti: [30.33, 28.5, null, null, null, null, null, null, 25],
      prezziLordi: [37, 34.77, null, null, null, null, null, null, null],
      ivaPerc: 22,
      gestioneMagazzino: true,
      ubicazione: 'A-03',
      scortaMinima: 10,
      giacenza: 17,
      ordinato: 0,
      fornitore: 'Fornitore Srl',
      codiceFornitore: 'ABC',
      note: 'Bancale lavabile',
      aggiornatoIl: ISTANTE,
    });
  });

  it('lascia undefined i campi assenti, mai stringhe vuote', () => {
    const scatola = catalogo.prodotti[2];
    expect(scatola?.descrizione).toBe('');
    expect(scatola?.categoria).toBeUndefined();
    expect(scatola?.um).toBeUndefined();
    expect(scatola?.giacenza).toBeUndefined();
    expect(scatola?.note).toBeUndefined();
    expect(scatola?.eliminatoIl).toBeUndefined();
    expect(scatola?.prezziNetti.every((p) => p === null)).toBe(true);
  });

  it('ignora i valori numerici non interpretabili', () => {
    expect(catalogo.prodotti[2]?.scortaMinima).toBeUndefined();
  });

  it('legge l IVA dall attributo Perc o dal testo dell elemento', () => {
    expect(catalogo.prodotti[1]?.ivaPerc).toBe(10);
    expect(catalogo.prodotti[2]?.ivaPerc).toBe(4);
  });

  it('legge ManageWarehouse e le giacenze negative', () => {
    expect(catalogo.prodotti[1]?.gestioneMagazzino).toBe(false);
    expect(catalogo.prodotti[1]?.giacenza).toBe(-3.5);
  });

  it('genera i barcode principali e aggiuntivi con origine easyfatt', () => {
    expect(catalogo.barcode).toEqual([
      {
        barcode: '8001234567890',
        codiceProdotto: '+banp_1200800p',
        origine: 'easyfatt',
        aggiornatoIl: ISTANTE,
      },
      {
        barcode: '90273782',
        codiceProdotto: '+banp_1200800p',
        origine: 'easyfatt',
        aggiornatoIl: ISTANTE,
      },
      {
        barcode: 'XY981',
        codiceProdotto: '+banp_1200800p',
        origine: 'easyfatt',
        aggiornatoIl: ISTANTE,
        quantitaConfezione: 12,
      },
      {
        barcode: '8009876543210',
        codiceProdotto: 'FILM500',
        origine: 'easyfatt',
        aggiornatoIl: ISTANTE,
      },
    ]);
  });
});

describe('analizzaCatalogo, full protocollo 3 con varianti', () => {
  const catalogo = analizzaCatalogo(catalogoFullV3, opzioni);

  it('non richiede l attributo Warehouse', () => {
    expect(catalogo.magazzino).toBeUndefined();
  });

  it('abbina i barcode delle varianti al prodotto padre', () => {
    expect(catalogo.barcode.filter((b) => b.codiceProdotto === 'MAGL-0042')).toEqual([
      { barcode: '0042', codiceProdotto: 'MAGL-0042', origine: 'easyfatt', aggiornatoIl: ISTANTE },
      {
        barcode: '0042/M/Blu',
        codiceProdotto: 'MAGL-0042',
        origine: 'easyfatt',
        aggiornatoIl: ISTANTE,
      },
      {
        barcode: '0042/L/Rosso',
        codiceProdotto: 'MAGL-0042',
        origine: 'easyfatt',
        aggiornatoIl: ISTANTE,
      },
    ]);
  });

  it('conserva i barcode numerici come stringhe, senza perdere gli zeri iniziali', () => {
    expect(catalogo.barcode[0]?.barcode).toBe('0042');
  });

  it('ignora un PackageQty non positivo', () => {
    const extra = catalogo.barcode.find((b) => b.barcode === 'SCARTA0');
    expect(extra?.quantitaConfezione).toBeUndefined();
  });

  it('accetta un prodotto senza alcun barcode', () => {
    expect(catalogo.prodotti.map((p) => p.codice)).toContain('SENZA-BARCODE');
  });
});

describe('analizzaCatalogo, incremental', () => {
  const catalogo = analizzaCatalogo(catalogoIncremental, opzioni);

  it('legge gli aggiornati e gli eliminati', () => {
    expect(catalogo.modalita).toBe('incremental');
    expect(catalogo.prodotti.map((p) => p.codice)).toEqual(['FILM500']);
    expect(catalogo.prodotti[0]?.giacenza).toBe(120.5);
    expect(catalogo.prodotti[0]?.ordinato).toBe(50);
    expect(catalogo.codiciEliminati).toEqual(['SCAT-30', '+banp_1200800p']);
  });

  it('genera i barcode solo dei prodotti aggiornati', () => {
    expect(catalogo.barcode.map((b) => b.barcode)).toEqual(['8009876543210']);
  });
});

describe('analizzaCatalogo, errori', () => {
  /** Esegue l analisi aspettandosi un ErroreCatalogo e restituisce il messaggio. */
  function messaggioErrore(xml: string): string {
    try {
      analizzaCatalogo(xml, opzioni);
    } catch (errore) {
      expect(errore).toBeInstanceOf(ErroreCatalogo);
      return (errore as Error).message;
    }
    throw new Error('l analisi è riuscita invece di fallire');
  }

  it('rifiuta un file vuoto', () => {
    expect(messaggioErrore('   ')).toBe('Il file del catalogo è vuoto.');
  });

  it('rifiuta un XML malformato indicando la riga', () => {
    const messaggio = messaggioErrore(catalogoMalformato);
    expect(messaggio).toContain('XML non valido');
    expect(messaggio).toMatch(/riga \d+/);
  });

  it('rifiuta un XML valido che non è un catalogo', () => {
    expect(messaggioErrore('<Altro><Cosa/></Altro>')).toContain(
      'Elemento radice EasyfattProducts non trovato',
    );
  });

  it('rifiuta un catalogo senza AppVersion', () => {
    expect(messaggioErrore('<EasyfattProducts Mode="full"><Products/></EasyfattProducts>')).toBe(
      'Attributo AppVersion mancante in EasyfattProducts.',
    );
  });

  it('rifiuta il protocollo 1 e le versioni sconosciute', () => {
    expect(
      messaggioErrore(
        '<EasyfattProducts AppVersion="1" Mode="full"><Products/></EasyfattProducts>',
      ),
    ).toContain('Versione del protocollo non supportata: 1');
    expect(
      messaggioErrore(
        '<EasyfattProducts AppVersion="9" Mode="full"><Products/></EasyfattProducts>',
      ),
    ).toContain('non supportata: 9');
  });

  it('rifiuta un catalogo senza Mode o con Mode sconosciuto', () => {
    expect(messaggioErrore('<EasyfattProducts AppVersion="2"><Products/></EasyfattProducts>')).toBe(
      'Attributo Mode mancante in EasyfattProducts.',
    );
    expect(
      messaggioErrore(
        '<EasyfattProducts AppVersion="2" Mode="delta"><Products/></EasyfattProducts>',
      ),
    ).toContain('Modalità non riconosciuta: delta');
  });

  it('rifiuta un prodotto senza Code, dicendo dove si trova', () => {
    expect(
      messaggioErrore(
        '<EasyfattProducts AppVersion="2" Mode="full"><Products>' +
          '<Product><Code>A1</Code></Product><Product><Description>senza codice</Description></Product>' +
          '</Products></EasyfattProducts>',
      ),
    ).toBe('Prodotto senza elemento Code in Products, posizione 2.');
    expect(
      messaggioErrore(
        '<EasyfattProducts AppVersion="2" Mode="incremental"><UpdatedProducts>' +
          '<Product><Description>senza codice</Description></Product>' +
          '</UpdatedProducts></EasyfattProducts>',
      ),
    ).toContain('in UpdatedProducts, posizione 1');
    expect(
      messaggioErrore(
        '<EasyfattProducts AppVersion="2" Mode="incremental"><DeletedProducts>' +
          '<Product><Code>A1</Code></Product><Product/>' +
          '</DeletedProducts></EasyfattProducts>',
      ),
    ).toContain('in DeletedProducts, posizione 2');
  });
});

describe('analizzaCatalogo, casi limite di struttura', () => {
  it('accetta un full senza elemento Products', () => {
    const catalogo = analizzaCatalogo(
      '<EasyfattProducts AppVersion="2" Mode="full"></EasyfattProducts>',
      opzioni,
    );
    expect(catalogo).toEqual({
      modalita: 'full',
      prodotti: [],
      barcode: [],
      codiciEliminati: [],
    });
  });

  it('accetta un incremental senza le due liste', () => {
    const catalogo = analizzaCatalogo(
      '<EasyfattProducts AppVersion="2" Mode="incremental"></EasyfattProducts>',
      opzioni,
    );
    expect(catalogo.prodotti).toEqual([]);
    expect(catalogo.codiciEliminati).toEqual([]);
  });

  it('tratta un solo prodotto come un elenco di uno', () => {
    const catalogo = analizzaCatalogo(
      '<EasyfattProducts AppVersion="2" Mode="full"><Products><Product>' +
        '<Code>A1</Code><Description>Uno</Description><ExtraBarcodes><Barcode>111</Barcode></ExtraBarcodes>' +
        '</Product></Products></EasyfattProducts>',
      opzioni,
    );
    expect(catalogo.prodotti).toHaveLength(1);
    expect(catalogo.barcode.map((b) => b.barcode)).toEqual(['111']);
  });

  it('ignora i barcode vuoti e i duplicati', () => {
    const catalogo = analizzaCatalogo(
      '<EasyfattProducts AppVersion="2" Mode="full"><Products>' +
        '<Product><Code>A1</Code><Barcode>111</Barcode><ExtraBarcodes><Barcode></Barcode>' +
        '<Barcode>111</Barcode><Barcode> 222 </Barcode></ExtraBarcodes></Product>' +
        '<Product><Code>A2</Code><Barcode>222</Barcode></Product>' +
        '</Products></EasyfattProducts>',
      opzioni,
    );
    expect(catalogo.barcode.map((b) => `${b.barcode}:${b.codiceProdotto}`)).toEqual([
      '111:A1',
      '222:A1',
    ]);
  });

  it('ignora elementi con attributi ma senza testo e sezioni di tipo inatteso', () => {
    const catalogo = analizzaCatalogo(
      '<EasyfattProducts AppVersion="3" Mode="full"><Products><Product>' +
        '<Code>A1</Code><Description Lang="it"></Description><Um/>' +
        '<ManageWarehouse>si</ManageWarehouse><Variants>nessuna</Variants>' +
        '</Product></Products></EasyfattProducts>',
      opzioni,
    );
    expect(catalogo.prodotti[0]?.descrizione).toBe('');
    expect(catalogo.prodotti[0]?.um).toBeUndefined();
    expect(catalogo.prodotti[0]?.gestioneMagazzino).toBe(true);
    expect(catalogo.barcode).toEqual([]);
  });

  it('legge testo e numeri anche dagli elementi che hanno attributi', () => {
    const catalogo = analizzaCatalogo(
      '<EasyfattProducts AppVersion="2" Mode="full"><Products><Product><Code>A1</Code>' +
        '<Description Lang="it">Con attributi</Description><AvailableQty Um="pz">5</AvailableQty>' +
        '</Product></Products></EasyfattProducts>',
      opzioni,
    );
    expect(catalogo.prodotti[0]?.descrizione).toBe('Con attributi');
    expect(catalogo.prodotti[0]?.giacenza).toBe(5);
  });

  it('tratta un attributo vuoto come assente', () => {
    const catalogo = analizzaCatalogo(
      '<EasyfattProducts AppVersion="2" Mode="full" Warehouse=""><Products/></EasyfattProducts>',
      opzioni,
    );
    expect(catalogo.magazzino).toBeUndefined();
  });

  it('accetta una sola variante, senza elenco', () => {
    const catalogo = analizzaCatalogo(
      '<EasyfattProducts AppVersion="3" Mode="full"><Products><Product><Code>A1</Code>' +
        '<Variants><Variant><Size>M</Size><Barcode>A1/M</Barcode></Variant></Variants>' +
        '</Product></Products></EasyfattProducts>',
      opzioni,
    );
    expect(catalogo.barcode.map((b) => b.barcode)).toEqual(['A1/M']);
  });

  it('legge l IVA anche quando Vat ha altri attributi ma non Perc', () => {
    const catalogo = analizzaCatalogo(
      '<EasyfattProducts AppVersion="2" Mode="full"><Products>' +
        '<Product><Code>A1</Code><Vat Class="Imponibile">22</Vat></Product>' +
        '<Product><Code>A2</Code><Vat Class="Esente"></Vat></Product>' +
        '</Products></EasyfattProducts>',
      opzioni,
    );
    expect(catalogo.prodotti[0]?.ivaPerc).toBe(22);
    expect(catalogo.prodotti[1]?.ivaPerc).toBeUndefined();
  });

  it('usa l istante corrente quando non ne viene passato uno', () => {
    const prima = Date.now();
    const catalogo = analizzaCatalogo(
      '<EasyfattProducts AppVersion="2" Mode="full"><Products><Product><Code>A1</Code></Product></Products></EasyfattProducts>',
    );
    const aggiornato = Date.parse(catalogo.prodotti[0]?.aggiornatoIl ?? '');
    expect(aggiornato).toBeGreaterThanOrEqual(prima);
    expect(aggiornato).toBeLessThanOrEqual(Date.now());
  });

  it('regge un catalogo da 10.000 prodotti senza ricorsione profonda', () => {
    const pezzi: string[] = ['<EasyfattProducts AppVersion="2" Mode="full"><Products>'];
    for (let i = 0; i < 10000; i += 1) {
      pezzi.push(
        `<Product><Code>ART${i}</Code><Description>Articolo ${i}</Description>` +
          `<Barcode>80000000${i}</Barcode><NetPrice1>${(i % 100) + 0.5}</NetPrice1>` +
          `<AvailableQty>${i}</AvailableQty><ExtraBarcodes><Barcode PackageQty="6">EXT${i}</Barcode></ExtraBarcodes>` +
          `</Product>`,
      );
    }
    pezzi.push('</Products></EasyfattProducts>');
    const catalogo = analizzaCatalogo(pezzi.join(''), opzioni);
    expect(catalogo.prodotti).toHaveLength(10000);
    expect(catalogo.barcode).toHaveLength(20000);
    expect(catalogo.prodotti[9999]?.codice).toBe('ART9999');
    expect(catalogo.barcode.at(-1)?.quantitaConfezione).toBe(6);
  });
});
