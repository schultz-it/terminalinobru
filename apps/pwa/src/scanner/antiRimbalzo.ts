/** Intervallo in cui la fotocamera non riemette lo stesso codice. */
export const INTERVALLO_ANTI_RIMBALZO_MS = 1500;

/**
 * Filtro anti-rimbalzo per le letture della fotocamera, che vede lo stesso codice a ogni
 * fotogramma. La funzione restituita dice se il codice va emesso: lo stesso codice viene
 * scartato per `intervalloMs` dall'ultima emissione, un codice diverso passa subito.
 */
export function creaAntiRimbalzo(
  intervalloMs = INTERVALLO_ANTI_RIMBALZO_MS,
): (codice: string, adesso: number) => boolean {
  let ultimo: { codice: string; istante: number } | undefined;
  return (codice, adesso) => {
    if (ultimo && ultimo.codice === codice && adesso - ultimo.istante < intervalloMs) {
      return false;
    }
    ultimo = { codice, istante: adesso };
    return true;
  };
}
