import type { ClienteDocumento } from '@terminalinobru/core';

/** Fine riga dell'XML generato: Easyfatt non richiede CRLF. */
const FINE_RIGA = '\n';

/** Rientro di un livello. */
const RIENTRO = '  ';

/** Fuso orario predefinito con cui la data del documento diventa `yyyy-mm-dd`. */
const FUSO_ORARIO_DEFAULT = 'Europe/Rome';

/** Riga di un documento: codice prodotto e quantità già aggregate. */
export type RigaDocumento = {
  codice: string;
  descrizione?: string;
  quantita: number;
  um?: string;
};

/** Documento di dominio da spedire a Easyfatt come ordine cliente (`DocumentType` C). */
export type DocumentoOrdine = {
  /** Numero progressivo del documento (`Number`), intero ≥ 1: Easyfatt ci deduplica. */
  numero: number;
  data: Date;
  cliente: ClienteDocumento;
  /** Commento interno (`InternalComment`). */
  commento?: string;
  righe: readonly RigaDocumento[];
};

/** Opzioni della generazione dei documenti. */
export type OpzioniDocumenti = {
  /** Denominazione del listino (`PriceList`) da scrivere in tutti i documenti. */
  listino?: string;
  /** Fuso orario IANA in cui leggere la data del documento. Default `Europe/Rome`. */
  fusoOrario?: string;
};

/** Errore di generazione dei documenti, con messaggio in italiano. */
export class ErroreDocumenti extends Error {
  constructor(messaggio: string) {
    super(messaggio);
    this.name = 'ErroreDocumenti';
  }
}

/** Tag `Customer*` nell'ordine in cui vengono scritti, con il campo del cliente corrispondente. */
const TAG_CLIENTE: readonly [string, keyof ClienteDocumento][] = [
  ['CustomerCode', 'codice'],
  ['CustomerName', 'nome'],
  ['CustomerAddress', 'indirizzo'],
  ['CustomerPostcode', 'cap'],
  ['CustomerCity', 'citta'],
  ['CustomerProvince', 'provincia'],
  ['CustomerCountry', 'nazione'],
  ['CustomerFiscalCode', 'codiceFiscale'],
  ['CustomerVatCode', 'partitaIva'],
  ['CustomerTel', 'telefono'],
  ['CustomerEmail', 'email'],
  ['CustomerEInvoiceDestCode', 'sdi'],
];

/** Caratteri non ammessi in XML 1.0 (i controlli, esclusi tab, a capo e ritorno carrello). */
// eslint-disable-next-line no-control-regex
const CARATTERI_NON_AMMESSI = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;

const ENTITA: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

/** Escape XML di un testo, togliendo i caratteri che renderebbero il file non valido. */
function escapeXml(testo: string): string {
  return testo
    .replace(CARATTERI_NON_AMMESSI, '')
    .replace(/[&<>"']/g, (carattere) => ENTITA[carattere] as string);
}

/** Riga `<Tag>valore</Tag>` rientrata, oppure nessuna riga se il valore è assente o vuoto. */
function tag(livello: number, nome: string, valore: string | undefined): string[] {
  if (valore === undefined || valore.trim() === '') return [];
  return [`${RIENTRO.repeat(livello)}<${nome}>${escapeXml(valore)}</${nome}>`];
}

/** Quantità con il punto decimale, al massimo 3 decimali e senza zeri inutili. */
export function formattaQuantita(quantita: number): string {
  if (!Number.isFinite(quantita)) {
    throw new ErroreDocumenti(`Quantità non valida: ${quantita}.`);
  }
  const testo = quantita.toFixed(3).replace(/\.?0+$/, '');
  return testo === '-0' ? '0' : testo;
}

/** Data `yyyy-mm-dd` nel fuso orario indicato. */
function formattaData(data: Date, fusoOrario: string, numero: number): string {
  if (Number.isNaN(data.getTime())) {
    throw new ErroreDocumenti(`Data non valida nel documento ${numero}.`);
  }
  const parti = new Intl.DateTimeFormat('en-GB', {
    timeZone: fusoOrario,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(data);
  const parte = (tipo: string) => parti.find((p) => p.type === tipo)?.value;
  return `${parte('year')}-${parte('month')}-${parte('day')}`;
}

/** Righe XML di un `Document`. */
function documento(doc: DocumentoOrdine, opzioni: OpzioniDocumenti, fusoOrario: string): string[] {
  if (!Number.isInteger(doc.numero) || doc.numero < 1) {
    throw new ErroreDocumenti(
      `Numero documento non valido: ${doc.numero}. Serve un intero da 1 in su.`,
    );
  }
  if (doc.cliente.nome.trim() === '') {
    throw new ErroreDocumenti(`Il documento ${doc.numero} non ha il nome del cliente.`);
  }
  const righe = ['    <Document>', ...tag(3, 'DocumentType', 'C')];
  for (const [nome, campo] of TAG_CLIENTE) righe.push(...tag(3, nome, doc.cliente[campo]));
  righe.push(
    ...tag(3, 'Date', formattaData(doc.data, fusoOrario, doc.numero)),
    ...tag(3, 'Number', String(doc.numero)),
    ...tag(3, 'PriceList', opzioni.listino),
    ...tag(3, 'InternalComment', doc.commento),
    '      <Rows>',
  );
  doc.righe.forEach((riga, indice) => {
    if (riga.codice.trim() === '') {
      throw new ErroreDocumenti(
        `Riga ${indice + 1} del documento ${doc.numero} senza codice prodotto.`,
      );
    }
    righe.push(
      '        <Row>',
      ...tag(5, 'Code', riga.codice),
      ...tag(5, 'Description', riga.descrizione),
      ...tag(5, 'Qty', formattaQuantita(riga.quantita)),
      ...tag(5, 'Um', riga.um),
      '        </Row>',
    );
  });
  righe.push('      </Rows>', '    </Document>');
  return righe;
}

/**
 * Genera l'`EasyfattDocuments` con un ordine cliente (`DocumentType` C) per ogni documento, per la
 * ricezione ordini e-commerce di Easyfatt. Senza prezzi: vedi docs/DECISIONI.md punto 55.
 */
export function generaDocumentiXml(
  documenti: readonly DocumentoOrdine[],
  opzioni: OpzioniDocumenti = {},
): string {
  const intestazione = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<EasyfattDocuments AppVersion="2" Creator="TerminalinoBru" CreatorUrl="">',
  ];
  const chiusura = '</EasyfattDocuments>';
  if (documenti.length === 0) {
    return [...intestazione, '  <Documents></Documents>', chiusura].join(FINE_RIGA);
  }
  const fusoOrario = opzioni.fusoOrario ?? FUSO_ORARIO_DEFAULT;
  const corpo = documenti.flatMap((doc) => documento(doc, opzioni, fusoOrario));
  return [...intestazione, '  <Documents>', ...corpo, '  </Documents>', chiusura].join(FINE_RIGA);
}

/** Genera l'`EasyfattDocuments` vuoto: equivale a `generaDocumentiXml([])`. */
export function generaDocumentiVuoto(): string {
  return generaDocumentiXml([]);
}
