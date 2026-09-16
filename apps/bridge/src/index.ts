import { Hono } from 'hono';

export interface Ambiente {
  DB: D1Database;
  ASSETS: Fetcher;
}

const app = new Hono<{ Bindings: Ambiente }>();

/** Endpoint di salute: conferma che il Worker risponde. */
app.get('/api/salute', (c) => c.json({ ok: true }));

export default app;
