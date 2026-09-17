import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { chiamaBridge, ErroreBridge, richiestaBridge } from '../src/api.js';

const connessione = { urlBridge: 'https://bridge.test', token: 'segreto' };

/** Promessa che non si risolve mai da sola e si rifiuta quando il segnale interrompe, come `fetch`. */
function appesa<T>(segnale: AbortSignal | null | undefined): Promise<T> {
  return new Promise((_, rifiuta) => {
    segnale?.addEventListener('abort', () => rifiuta(new DOMException('Interrotta', 'AbortError')));
  });
}

// Collaudo T10: sul telefono "Sincronizzazione…" restava in corso per sempre.
describe('tempo massimo delle chiamate al bridge', () => {
  it('interrompe una richiesta senza risposta con un messaggio chiaro', async () => {
    const recupera = ((_: RequestInfo | URL, init?: RequestInit) =>
      appesa<Response>(init?.signal)) as typeof fetch;
    const errore = await chiamaBridge(connessione, '/api/clienti', {}, recupera, 20).catch(
      (e: unknown) => e,
    );
    expect(errore).toBeInstanceOf(ErroreBridge);
    expect((errore as ErroreBridge).message).toBe(
      'Il bridge non ha risposto entro un minuto: controlla la connessione e riprova.',
    );
  });

  it('interrompe anche la lettura di un corpo che non arriva mai', async () => {
    const recupera = ((_: RequestInfo | URL, init?: RequestInit) => {
      const risposta = new Response('{}', { status: 200 });
      risposta.json = () => appesa(init?.signal);
      return Promise.resolve(risposta);
    }) as typeof fetch;
    await expect(
      richiestaBridge(connessione, '/api/clienti', z.object({}), recupera, 20),
    ).rejects.toThrow('Il bridge non ha risposto entro un minuto');
  });

  it('una rete assente resta «non raggiungibile»', async () => {
    const recupera = (() => Promise.reject(new TypeError('Failed to fetch'))) as typeof fetch;
    await expect(chiamaBridge(connessione, '/api/stato', {}, recupera, 1000)).rejects.toThrow(
      'Bridge non raggiungibile',
    );
  });
});
