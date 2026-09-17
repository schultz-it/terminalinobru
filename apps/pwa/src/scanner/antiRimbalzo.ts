/** Intervallo senza avvistamenti dopo il quale la fotocamera riemette lo stesso codice. */
export const INTERVALLO_ANTI_RIMBALZO_MS = 1500;

/**
 * Filtro anti-rimbalzo per le letture della fotocamera, che vede lo stesso codice a ogni
 * fotogramma. La funzione restituita dice se il codice va emesso: lo stesso codice resta
 * scartato finché continua a essere visto, e viene riemesso solo dopo `intervalloMs` dall'ultimo
 * avvistamento (in pratica bisogna toglierlo dall'inquadratura). Un codice diverso passa subito.
 * Così in modalità "somma uno" (T07) un'etichetta ferma davanti alla fotocamera conta una volta.
 */
export function creaAntiRimbalzo(
  intervalloMs = INTERVALLO_ANTI_RIMBALZO_MS,
): (codice: string, adesso: number) => boolean {
  let ultimo: { codice: string; istante: number } | undefined;
  return (codice, adesso) => {
    const rimbalzo =
      ultimo !== undefined && ultimo.codice === codice && adesso - ultimo.istante < intervalloMs;
    ultimo = { codice, istante: adesso };
    return !rimbalzo;
  };
}
