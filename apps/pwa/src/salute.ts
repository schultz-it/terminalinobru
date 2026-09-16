/** Esito della chiamata di salute al bridge. */
export type EsitoSalute =
  { stato: 'in-corso' } | { stato: 'ok' } | { stato: 'errore'; messaggio: string };

/** Interroga `GET /api/salute` sul bridge e traduce l'esito in italiano. */
export async function verificaSalute(recupera: typeof fetch = fetch): Promise<EsitoSalute> {
  try {
    const risposta = await recupera('/api/salute');
    if (!risposta.ok) {
      return { stato: 'errore', messaggio: `Il bridge ha risposto ${risposta.status}` };
    }
    const corpo = (await risposta.json()) as { ok?: boolean };
    return corpo.ok === true
      ? { stato: 'ok' }
      : { stato: 'errore', messaggio: 'Risposta del bridge inattesa' };
  } catch (errore) {
    return {
      stato: 'errore',
      messaggio: errore instanceof Error ? errore.message : 'Bridge non raggiungibile',
    };
  }
}

/** Testo da mostrare a schermo per un dato esito. */
export function descriviEsito(esito: EsitoSalute): string {
  switch (esito.stato) {
    case 'in-corso':
      return 'Controllo del bridge in corso…';
    case 'ok':
      return 'Bridge raggiungibile';
    case 'errore':
      return `Bridge non raggiungibile: ${esito.messaggio}`;
  }
}
