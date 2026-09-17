/**
 * Nome del file dall'intestazione `Content-Disposition: attachment; filename="..."` del bridge,
 * o il ripiego se manca o non si riconosce.
 */
export function nomeFileDaIntestazione(
  intestazione: string | null | undefined,
  ripiego: string,
): string {
  if (!intestazione) return ripiego;
  const corrispondenza = /filename\*?=(?:UTF-8''|")?([^";]+)"?/i.exec(intestazione);
  const nome = corrispondenza?.[1]?.trim();
  if (!nome) return ripiego;
  try {
    return decodeURIComponent(nome);
  } catch {
    return nome;
  }
}

/** Avvia il download di un blob nel browser con il nome dato, senza passare dall'URL della pagina. */
export function scaricaBlob(nome: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nome;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
