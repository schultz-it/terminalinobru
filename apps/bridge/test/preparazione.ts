import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeAll, beforeEach } from 'vitest';

/** Tabelle da svuotare fra un test e l'altro, in ordine di dipendenza. */
const TABELLE = ['riga', 'sessione', 'cliente', 'barcode', 'prodotto', 'tenant'];

/** Applica le migrazioni D1 al database in memoria prima dei test di ogni file. */
beforeAll(async () => {
  await applyD1Migrations(env.DB, env.MIGRAZIONI);
});

/** Ogni test parte da un database vuoto ma già migrato. */
beforeEach(async () => {
  await env.DB.batch(TABELLE.map((tabella) => env.DB.prepare(`DELETE FROM ${tabella}`)));
});
