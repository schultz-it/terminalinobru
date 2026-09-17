import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  ErroreFileClienti,
  importaClientiNelBridge,
  leggiFileClienti,
  ripulisciTabella,
} from '../src/esportazioni/clienti.js';
import { indiceColonna, leggiXlsx, numeroComeTesto } from '../src/esportazioni/xlsx.js';
import { fetchFinto } from './aiuti.js';

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';

/** Un .xlsx minimo come quelli di Easyfatt: stringhe condivise e un foglio. */
function xlsx(foglio: string, stringhe?: string, nomeFoglio = 'xl/worksheets/sheet1.xml') {
  const parti: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8('<Types/>'),
    'xl/workbook.xml': strToU8(`<workbook ${NS}/>`),
    [nomeFoglio]: strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet ${NS}><sheetData>${foglio}</sheetData></worksheet>`,
    ),
  };
  if (stringhe !== undefined) {
    parti['xl/sharedStrings.xml'] = strToU8(`<sst ${NS}>${stringhe}</sst>`);
  }
  return zipSync(parti);
}

const file = (name: string, contenuto: Uint8Array | string) => ({
  name,
  arrayBuffer: async () => {
    const byte = typeof contenuto === 'string' ? strToU8(contenuto) : contenuto;
    return byte.buffer.slice(byte.byteOffset, byte.byteOffset + byte.byteLength) as ArrayBuffer;
  },
});

describe('numeroComeTesto', () => {
  it('scrive in cifre la notazione esponenziale, senza perdere precisione', () => {
    expect(numeroComeTesto('3.322350178E+9')).toBe('3322350178');
    expect(numeroComeTesto('1.2345678901234567E+16')).toBe('12345678901234567');
    expect(numeroComeTesto('1E+3')).toBe('1000');
    expect(numeroComeTesto('1.5E-3')).toBe('0.0015');
    expect(numeroComeTesto('-2.50e1')).toBe('-25');
    expect(numeroComeTesto('1.25E1')).toBe('12.5');
  });

  it('lascia com’è un valore già in cifre o che non è un numero', () => {
    expect(numeroComeTesto('47122')).toBe('47122');
    expect(numeroComeTesto('0.5')).toBe('0.5');
    expect(numeroComeTesto('E+5')).toBe('E+5');
    expect(numeroComeTesto('')).toBe('');
  });
});

describe('indiceColonna', () => {
  it('converte le lettere della colonna in indice', () => {
    expect(indiceColonna('A1')).toBe(0);
    expect(indiceColonna('T12')).toBe(19);
    expect(indiceColonna('AB3')).toBe(27);
    expect(indiceColonna('12')).toBeUndefined();
  });
});

describe('leggiXlsx', () => {
  it('legge stringhe condivise, testo in linea, numeri e buchi di righe e colonne', () => {
    const contenuto = xlsx(
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="D1" t="s"><v>2</v></c></row>' +
        '<row r="2"><c r="A2"><v>18</v></c><c r="B2" t="s"><v>3</v></c><c r="C2" t="inlineStr"><is><t xml:space="preserve"> Via Roma 1</t></is></c><c r="D2"><v>3.322350178E+9</v></c></row>' +
        '<row r="4"><c r="A4" t="str"><v>20</v></c><c r="B4" t="e"><v>#N/A</v></c></row>',
      '<si><t>Cod.</t></si><si><t>Denominazione</t></si><si><t>Partita Iva</t></si>' +
        '<si><r><t>Città </t></r><r><rPr><b/></rPr><t>Àlfa</t></r><rPh><t>ふりがな</t></rPh></si>',
    );
    expect(leggiXlsx(contenuto)).toEqual([
      ['Cod.', 'Denominazione', '', 'Partita Iva'],
      ['18', 'Città Àlfa', ' Via Roma 1', '3322350178'],
      [],
      ['20', ''],
    ]);
  });

  it('senza stringhe condivise e con un foglio dal nome diverso legge lo stesso', () => {
    const contenuto = xlsx(
      '<row r="1"><c r="A1" t="inlineStr"><is><t>Cod.</t></is></c></row>',
      undefined,
      'xl/worksheets/foglio.xml',
    );
    expect(leggiXlsx(contenuto)).toEqual([['Cod.']]);
  });

  it('rifiuta un file che non è uno zip, uno zip senza fogli e un foglio danneggiato', () => {
    expect(() => leggiXlsx(strToU8('Cod.;Denominazione'))).toThrow('Excel .xlsx leggibile');
    expect(() => leggiXlsx(zipSync({ 'a.txt': strToU8('x') }))).toThrow('nessun foglio');
    const rotto = zipSync({ 'xl/worksheets/sheet1.xml': strToU8('<worksheet><row>') });
    expect(() => leggiXlsx(rotto)).toThrow('danneggiato');
  });
});

describe('leggiFileClienti', () => {
  const intestazioni = ['Cod.', 'Codice fiscale', 'Partita Iva', 'Denominazione', 'Prov.'];

  it("interpreta l'export Excel di Easyfatt, zeri iniziali della partita IVA compresi", async () => {
    const stringhe = [...intestazioni, 'Ceramiche Italiane', 'fc'];
    const contenuto = xlsx(
      `<row r="1">${intestazioni.map((_, i) => `<c t="s"><v>${i}</v></c>`).join('')}</row>` +
        '<row r="2"><c r="A2"><v>18</v></c><c r="C2"><v>3322350178</v></c><c r="D2" t="s"><v>5</v></c><c r="E2" t="s"><v>6</v></c></row>' +
        '<row r="3"><c r="A3"><v>19</v></c></row>',
      stringhe.map((s) => `<si><t>${s}</t></si>`).join(''),
    );
    const esito = await leggiFileClienti(
      file('Soggetti.xlsx', contenuto),
      new Date('2026-09-17T10:00:00.000Z'),
    );
    expect(esito.clienti).toEqual([
      {
        id: '18',
        codice: '18',
        nome: 'Ceramiche Italiane',
        partitaIva: '03322350178',
        provincia: 'FC',
        origine: 'easyfatt',
        aggiornatoIl: '2026-09-17T10:00:00.000Z',
      },
    ]);
    // Riga 3 senza nome: scartata con avviso che cita la riga di Excel.
    expect(esito.avvisi.filter((avviso) => avviso.startsWith('Riga'))).toEqual([
      expect.stringContaining('Riga 3'),
    ]);
  });

  it('legge anche il CSV, in UTF-8 o nella codifica di Windows', async () => {
    const csv = 'Cod.;Denominazione;Città\r\n7;Forlì Imballi;Forlì\r\n';
    const utf8 = await leggiFileClienti(file('clienti.csv', csv));
    expect(utf8.clienti[0]).toMatchObject({ id: '7', nome: 'Forlì Imballi', citta: 'Forlì' });
    const windows = new Uint8Array([...strToU8('Cod.;Denominazione\r\n7;Forl'), 0xec]);
    const ansi = await leggiFileClienti(file('CLIENTI.CSV', windows));
    expect(ansi.clienti[0]?.nome).toBe('Forlì');
  });

  it('riconosce un Excel dal contenuto anche senza estensione, e rifiuta gli altri file', async () => {
    const contenuto = xlsx(
      '<row r="1"><c t="inlineStr"><is><t>Cod.</t></is></c><c t="inlineStr"><is><t>Denominazione</t></is></c></row>' +
        '<row r="2"><c><v>1</v></c><c t="inlineStr"><is><t>Uno</t></is></c></row>',
    );
    expect((await leggiFileClienti(file('Soggetti', contenuto))).clienti).toHaveLength(1);
    await expect(leggiFileClienti(file('note.txt', 'ciao'))).rejects.toThrow(ErroreFileClienti);
  });

  it('trasforma gli errori della tabella in un messaggio da mostrare', async () => {
    await expect(leggiFileClienti(file('x.csv', 'Nome;Città\r\nA;B\r\n'))).rejects.toThrow(
      ErroreFileClienti,
    );
    await expect(leggiFileClienti(file('x.xlsx', 'non è uno zip'))).rejects.toThrow(
      'Excel .xlsx leggibile',
    );
  });
});

describe('ripulisciTabella', () => {
  it('toglie i campi che il bridge rifiuterebbe e li segnala negli avvisi', () => {
    const cliente = {
      id: '1001',
      codice: '1001',
      nome: 'Bianchi',
      email: '**',
      citta: 'Cesena',
      origine: 'easyfatt' as const,
      aggiornatoIl: '2026-09-17T10:00:00.000Z',
    };
    const esito = ripulisciTabella({
      clienti: [cliente],
      avvisi: ['Riga 3: manca il nome, riga scartata.'],
    });
    expect(esito.clienti).toEqual([
      {
        id: '1001',
        codice: '1001',
        nome: 'Bianchi',
        citta: 'Cesena',
        origine: 'easyfatt',
        aggiornatoIl: '2026-09-17T10:00:00.000Z',
      },
    ]);
    expect(esito.avvisi).toEqual([
      'Riga 3: manca il nome, riga scartata.',
      "Cliente 1001 (Bianchi): campo email «**» non caricato. L'email non è valida. Va corretto in Easyfatt.",
    ]);
  });
});

describe('importaClientiNelBridge', () => {
  const clienti = [
    {
      id: '18',
      codice: '18',
      nome: 'Ceramiche',
      origine: 'easyfatt' as const,
      aggiornatoIl: '2026-09-17T10:00:00.000Z',
    },
  ];

  it('manda i clienti in JSON e restituisce i conteggi del bridge', async () => {
    const { recupera, chiamate } = fetchFinto(Response.json({ importati: 1, eliminati: 3 }));
    const esito = await importaClientiNelBridge(
      { urlBridge: 'https://bridge.esempio.it', token: 'segreto' },
      clienti,
      recupera,
    );
    expect(esito).toEqual({ importati: 1, eliminati: 3 });
    expect(chiamate[0]?.url).toBe('https://bridge.esempio.it/api/clienti/importa');
    expect(chiamate[0]?.init?.method).toBe('POST');
    expect(JSON.parse(String(chiamate[0]?.init?.body))).toEqual({ clienti });
  });

  it("riporta l'errore del bridge", async () => {
    const { recupera } = fetchFinto(
      Response.json({ errore: 'Massimo 5000 clienti per invio.' }, { status: 413 }),
    );
    await expect(
      importaClientiNelBridge({ urlBridge: '', token: 'segreto' }, clienti, recupera),
    ).rejects.toThrow('Massimo 5000 clienti per invio.');
  });
});
