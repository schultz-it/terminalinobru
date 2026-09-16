import { describe, expect, it } from 'vitest';
import { NOME_PACCHETTO } from '../src/index.js';

describe('core', () => {
  it('espone il nome del pacchetto', () => {
    expect(NOME_PACCHETTO).toBe('@terminalinobru/core');
  });
});
