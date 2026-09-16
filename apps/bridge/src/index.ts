import { Hono } from 'hono';
import type { Ambiente, Contesto } from './ambiente.js';
import { rotteApi } from './rotte-api.js';
import { rotteEasyfatt } from './rotte-easyfatt.js';

export type { Ambiente };

const app = new Hono<Contesto>();

/** Endpoint di salute: conferma che il Worker risponde. */
app.get('/api/salute', (c) => c.json({ ok: true }));

app.route('/easyfatt', rotteEasyfatt);
app.route('/api', rotteApi);

export default app;
