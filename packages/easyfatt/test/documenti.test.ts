import { describe, expect, it } from 'vitest';
import { generaDocumentiVuoto } from '../src/index.js';

describe('generaDocumentiVuoto', () => {
  it('produce l XML vuoto della documentazione', () => {
    expect(generaDocumentiVuoto()).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<EasyfattDocuments AppVersion="2" Creator="TerminalinoBru" CreatorUrl="">\n' +
        '  <Documents></Documents>\n' +
        '</EasyfattDocuments>',
    );
  });
});
