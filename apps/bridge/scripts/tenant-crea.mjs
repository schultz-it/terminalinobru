#!/usr/bin/env node
/**
 * Crea un tenant nel database D1 del bridge.
 *
 *   pnpm --filter bridge tenant:crea -- --nome "Imballaggi Brunelli" --utente easyfatt
 *   pnpm --filter bridge tenant:crea -- --nome "..." --utente "..." --remote
 *   pnpm --filter bridge tenant:crea -- --nome "..." --utente "..." --remote --url https://bru.esempio.it
 *
 * Genera password Easyfatt e token app casuali, li stampa in chiaro una volta sola e salva nel
 * database soltanto i loro hash SHA-256. I valori in chiaro non sono recuperabili: vanno copiati
 * subito in Easyfatt e nelle impostazioni della PWA.
 *
 * Con `--url` salva anche `setup-<utente>.svg`: un QR del testo
 * `terminalinobru://setup?url=...&token=...` da inquadrare con "Importa da QR" nella PWA. Il file
 * contiene il token in chiaro e va cancellato subito dopo l'uso (vedi docs/RUNBOOK.md).
 */
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import QRCode from 'qrcode';

/** Nome del binding D1 dichiarato in wrangler.toml. */
const BINDING_DB = 'DB';

/** Legge gli argomenti `--nome`, `--utente`, `--url` e il flag `--remote`. */
function leggiArgomenti(argomenti) {
  const valori = { remoto: false };
  for (let indice = 0; indice < argomenti.length; indice += 1) {
    const argomento = argomenti[indice];
    if (argomento === '--') {
      // pnpm inoltra il separatore insieme agli argomenti: va ignorato.
      continue;
    }
    if (argomento === '--remote') {
      valori.remoto = true;
    } else if (argomento === '--nome' || argomento === '--utente' || argomento === '--url') {
      const valore = argomenti[indice + 1];
      if (valore === undefined || valore.startsWith('--')) {
        errore(`Manca il valore dopo ${argomento}.`);
      }
      valori[{ '--nome': 'nome', '--utente': 'utente', '--url': 'url' }[argomento]] = valore;
      indice += 1;
    } else {
      errore(`Argomento non riconosciuto: ${argomento}.`);
    }
  }
  return valori;
}

/** Stampa un messaggio d'errore in italiano ed esce con codice 1. */
function errore(messaggio) {
  console.error(`Errore: ${messaggio}`);
  console.error(
    'Uso: pnpm --filter bridge tenant:crea -- --nome "Nome azienda" --utente utente ' +
      '[--remote] [--url https://dominio]',
  );
  process.exit(1);
}

/** Genera un segreto casuale stampabile, senza caratteri che diano problemi negli URL. */
function segreto(byte) {
  return randomBytes(byte).toString('base64url');
}

/** SHA-256 in esadecimale minuscolo, lo stesso calcolato dal Worker. */
function hash(valore) {
  return createHash('sha256').update(valore, 'utf8').digest('hex');
}

/** Racchiude un valore fra apici singoli raddoppiando quelli interni, come vuole SQLite. */
function letterale(valore) {
  return `'${String(valore).replaceAll("'", "''")}'`;
}

const opzioni = leggiArgomenti(process.argv.slice(2));
if (opzioni.nome === undefined || opzioni.nome.trim() === '')
  errore('Il nome del tenant è obbligatorio.');
if (opzioni.utente === undefined || opzioni.utente.trim() === '') {
  errore("L'utente Easyfatt è obbligatorio.");
}
if (opzioni.url !== undefined && !opzioni.url.startsWith('https://')) {
  errore('--url deve iniziare con https://.');
}

const id = randomUUID();
const password = segreto(18);
const token = segreto(32);
const creatoIl = new Date().toISOString();

const sql =
  'INSERT INTO tenant (id, nome, easyfatt_utente, easyfatt_password_hash, token_app_hash, creato_il) VALUES (' +
  [
    letterale(id),
    letterale(opzioni.nome.trim()),
    letterale(opzioni.utente.trim()),
    letterale(hash(password)),
    letterale(hash(token)),
    letterale(creatoIl),
  ].join(', ') +
  ');\n';

const cartella = mkdtempSync(join(tmpdir(), 'terminalinobru-tenant-'));
const percorso = join(cartella, 'tenant.sql');
let esito;
try {
  writeFileSync(percorso, sql, { mode: 0o600 });
  esito = spawnSync(
    'wrangler',
    [
      'd1',
      'execute',
      BINDING_DB,
      opzioni.remoto ? '--remote' : '--local',
      '--yes',
      '--file',
      percorso,
    ],
    { stdio: 'inherit', shell: false },
  );
} finally {
  rmSync(cartella, { recursive: true, force: true });
}

if (esito.error !== undefined && esito.error !== null) {
  console.error(`Errore: impossibile eseguire wrangler (${esito.error.message}).`);
  process.exit(1);
}
if (esito.status !== 0) {
  console.error(
    '\nErrore: wrangler non è riuscito a inserire il tenant. Se il messaggio parla di vincolo UNIQUE, ' +
      "l'utente Easyfatt indicato esiste già.",
  );
  process.exit(esito.status ?? 1);
}

console.log(`
Tenant creato${opzioni.remoto ? ' sul database remoto' : ' sul database locale'}.

  Nome ................ ${opzioni.nome.trim()}
  Id .................. ${id}
  Utente Easyfatt ..... ${opzioni.utente.trim()}
  Password Easyfatt ... ${password}
  Token app ........... ${token}

Questi valori non sono più recuperabili: il database contiene solo gli hash SHA-256.
Copiali adesso in Easyfatt (Opzioni > Moduli > E-commerce) e nelle impostazioni della PWA.
`);

if (opzioni.url !== undefined) {
  const testoQr = `terminalinobru://setup?url=${encodeURIComponent(opzioni.url)}&token=${encodeURIComponent(token)}`;
  const percorsoQr = `setup-${opzioni.utente.trim()}.svg`;
  const svg = await QRCode.toString(testoQr, { type: 'svg' });
  writeFileSync(percorsoQr, svg, { mode: 0o600 });
  console.log(
    `QR di setup salvato in ${percorsoQr}. Contiene il token in chiaro: aprilo sul PC, ` +
      'inquadralo dal telefono in Impostazioni > Importa da QR, poi cancella il file.\n',
  );
}
