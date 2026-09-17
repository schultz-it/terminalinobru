import { formattaDataOra } from './formato.js';

/** Dati di versione scritti nel bundle da vite.config.ts (`define`). */
export type VersioneApp = {
  /** Numero del package.json della PWA. */
  numero: string;
  /** Primi 7 caratteri del commit della build, oppure `sviluppo`. */
  commit: string;
  /** Istante ISO in cui il bundle è stato compilato. */
  data: string;
};

declare const __VERSIONE_APP__: VersioneApp;

/** Versione di questo bundle. */
export const VERSIONE_APP: VersioneApp = __VERSIONE_APP__;

/** Riga da mostrare all'utente, per esempio `Versione 0.1.0 · build 1f0b0ea del 17/09/2026, 15:32`. */
export function descriviVersione(versione: VersioneApp = VERSIONE_APP): string {
  return `Versione ${versione.numero} · build ${versione.commit} del ${formattaDataOra(versione.data)}`;
}
