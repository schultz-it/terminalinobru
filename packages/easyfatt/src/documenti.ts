/** Fine riga dell'XML generato. */
const FINE_RIGA = '\n';

/**
 * Genera l'`EasyfattDocuments` vuoto con cui il bridge risponde al polling di Easyfatt in v1.
 */
export function generaDocumentiVuoto(): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<EasyfattDocuments AppVersion="2" Creator="TerminalinoBru" CreatorUrl="">',
    '  <Documents></Documents>',
    '</EasyfattDocuments>',
  ].join(FINE_RIGA);
}
