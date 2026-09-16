import { describe, expect, it } from 'vitest';
import { basic, chiama, chiamaApi, creaTenant } from './aiuti.js';
import { confrontoCostante, leggiCredenzialiBase } from '../src/autenticazione.js';

describe('autenticaEasyfatt', () => {
  it('accetta le credenziali giuste in Basic auth', async () => {
    const tenant = await creaTenant();
    const risposta = await chiama(
      new Request('http://localhost/easyfatt/documenti', {
        headers: { authorization: basic(tenant.utente, tenant.password) },
      }),
    );
    expect(risposta.status).toBe(200);
  });

  it("accetta l'header HTTP_X_AUTHORIZATION con il solo base64", async () => {
    const tenant = await creaTenant();
    const risposta = await chiama(
      new Request('http://localhost/easyfatt/documenti', {
        headers: { HTTP_X_AUTHORIZATION: btoa(`${tenant.utente}:${tenant.password}`) },
      }),
    );
    expect(risposta.status).toBe(200);
  });

  it("accetta l'header X-Authorization con il prefisso Basic", async () => {
    const tenant = await creaTenant();
    const risposta = await chiama(
      new Request('http://localhost/easyfatt/documenti', {
        headers: { 'X-Authorization': basic(tenant.utente, tenant.password) },
      }),
    );
    expect(risposta.status).toBe(200);
  });

  it('rifiuta la password sbagliata con testo puro e WWW-Authenticate', async () => {
    const tenant = await creaTenant();
    const risposta = await chiama(
      new Request('http://localhost/easyfatt/documenti', {
        headers: { authorization: basic(tenant.utente, 'sbagliata') },
      }),
    );
    expect(risposta.status).toBe(401);
    expect(await risposta.text()).toBe('Credenziali non valide');
    expect(risposta.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(risposta.headers.get('www-authenticate')).toMatch(/^Basic/);
  });

  it('rifiuta un utente inesistente', async () => {
    await creaTenant();
    const risposta = await chiama(
      new Request('http://localhost/easyfatt/documenti', {
        headers: { authorization: basic('nessuno', 'password-1') },
      }),
    );
    expect(risposta.status).toBe(401);
    expect(await risposta.text()).toBe('Credenziali non valide');
  });

  it('rifiuta la richiesta senza alcun header di autenticazione', async () => {
    await creaTenant();
    const risposta = await chiama(new Request('http://localhost/easyfatt/documenti'));
    expect(risposta.status).toBe(401);
  });

  it('rifiuta un header che non è base64 valido o non contiene i due punti', async () => {
    await creaTenant();
    for (const valore of ['Basic ???non-base64???', `Basic ${btoa('senzaduepunti')}`, 'Basic ']) {
      const risposta = await chiama(
        new Request('http://localhost/easyfatt/documenti', { headers: { authorization: valore } }),
      );
      expect(risposta.status).toBe(401);
    }
  });

  it('non confonde due tenant diversi', async () => {
    const primo = await creaTenant(1);
    const secondo = await creaTenant(2);
    const risposta = await chiama(
      new Request('http://localhost/easyfatt/documenti', {
        headers: { authorization: basic(primo.utente, secondo.password) },
      }),
    );
    expect(risposta.status).toBe(401);
  });
});

describe('autenticaApp', () => {
  it('accetta il token del tenant', async () => {
    const tenant = await creaTenant();
    const risposta = await chiamaApi('/api/stato', tenant.token);
    expect(risposta.status).toBe(200);
    expect(await risposta.json()).toMatchObject({ nome: tenant.nome, prodotti: 0 });
  });

  it('rifiuta un token sbagliato con JSON', async () => {
    await creaTenant();
    const risposta = await chiamaApi('/api/stato', 'token-inventato');
    expect(risposta.status).toBe(401);
    expect(await risposta.json()).toEqual({ errore: 'Token non valido' });
  });

  it('rifiuta la richiesta senza header Authorization', async () => {
    await creaTenant();
    const risposta = await chiamaApi('/api/catalogo', null);
    expect(risposta.status).toBe(401);
    expect(await risposta.json()).toEqual({ errore: 'Token non valido' });
  });

  it('rifiuta uno schema diverso da Bearer', async () => {
    const tenant = await creaTenant();
    const risposta = await chiama(
      new Request('http://localhost/api/stato', {
        headers: { authorization: basic(tenant.utente, tenant.password) },
      }),
    );
    expect(risposta.status).toBe(401);
  });
});

describe('funzioni di supporto', () => {
  it('confrontoCostante distingue lunghezza e contenuto', () => {
    expect(confrontoCostante('abc', 'abc')).toBe(true);
    expect(confrontoCostante('abc', 'abd')).toBe(false);
    expect(confrontoCostante('abc', 'abcd')).toBe(false);
  });

  it('leggiCredenzialiBase gestisce le password che contengono i due punti', () => {
    const intestazioni = new Headers({ authorization: `Basic ${btoa('utente:pa:ss')}` });
    expect(leggiCredenzialiBase(intestazioni)).toEqual({ utente: 'utente', password: 'pa:ss' });
  });

  it('leggiCredenzialiBase decodifica gli accenti come UTF-8', () => {
    const byte = new TextEncoder().encode('perità:pàssword');
    const base64 = btoa(String.fromCharCode(...byte));
    expect(leggiCredenzialiBase(new Headers({ authorization: `Basic ${base64}` }))).toEqual({
      utente: 'perità',
      password: 'pàssword',
    });
  });

  it('leggiCredenzialiBase restituisce undefined senza header', () => {
    expect(leggiCredenzialiBase(new Headers())).toBeUndefined();
  });
});
