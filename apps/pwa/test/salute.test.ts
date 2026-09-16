import { describe, expect, it } from 'vitest';
import { descriviEsito, verificaSalute } from '../src/salute.js';

describe('verificaSalute', () => {
  it('riconosce la risposta ok del bridge', async () => {
    const finto = (async () => Response.json({ ok: true })) as unknown as typeof fetch;
    expect(await verificaSalute(finto)).toEqual({ stato: 'ok' });
  });

  it('segnala il codice di stato quando il bridge fallisce', async () => {
    const finto = (async () => new Response('ko', { status: 500 })) as unknown as typeof fetch;
    const esito = await verificaSalute(finto);
    expect(esito.stato).toBe('errore');
    expect(descriviEsito(esito)).toContain('500');
  });
});
