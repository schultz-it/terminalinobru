/** Import dei file di fixture come testo grezzo, tramite il caricatore `?raw` di Vite. */
declare module '*?raw' {
  const contenuto: string;
  export default contenuto;
}
