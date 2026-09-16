import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import worker from '../src/index.js';

describe('GET /api/salute', () => {
  it('risponde ok', async () => {
    const richiesta = new Request('http://localhost/api/salute');
    const ctx = createExecutionContext();
    const risposta = await worker.fetch(richiesta, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(risposta.status).toBe(200);
    expect(await risposta.json()).toEqual({ ok: true });
  });
});
