/** Binding e variabili di contesto del Worker. */

/** Binding dichiarati in `wrangler.toml`. */
export interface Ambiente {
  DB: D1Database;
  ASSETS: Fetcher;
}

/** Riga della tabella `tenant`, con i nomi di colonna del database. */
export interface Tenant {
  id: string;
  nome: string;
  easyfatt_utente: string;
  easyfatt_password_hash: string;
  token_app_hash: string;
  stringa_formato: string;
  separatore_decimale: string;
  ultimo_catalogo_il: string | null;
  creato_il: string;
}

/** Variabili che i middleware di autenticazione depositano nel contesto Hono. */
export interface Variabili {
  tenant: Tenant;
}

/** Tipo del contesto Hono usato da tutte le rotte del bridge. */
export interface Contesto {
  Bindings: Ambiente;
  Variables: Variabili;
}
