import { useEffect } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import { Layout } from './componenti/Layout.js';
import { db } from './db.js';
import { caricaImpostazioni } from './impostazioni.js';
import { Consultazione } from './pagine/Consultazione.js';
import { Home } from './pagine/Home.js';
import { Impostazioni } from './pagine/Impostazioni.js';
import { SchedaProdotto } from './pagine/SchedaProdotto.js';
import { Esportazioni, Sessione } from './pagine/Segnaposto.js';
import { serveSyncAutomatica } from './sync/catalogo.js';
import { avviaSincronizzazione } from './sync/statoSync.js';

/** All'avvio sincronizza il catalogo se si è online e l'ultima sync è di oltre 6 ore fa. */
function useSyncAllAvvio() {
  useEffect(() => {
    void caricaImpostazioni(db)
      .then((impostazioni) => {
        const serve = serveSyncAutomatica({
          online: navigator.onLine,
          token: impostazioni.token,
          ultimaSincronizzazione: impostazioni.ultimaSincronizzazione,
          adesso: new Date(),
        });
        if (serve) return avviaSincronizzazione();
        return undefined;
      })
      .catch((errore: unknown) => console.error('Sincronizzazione automatica non avviata', errore));
  }, []);
}

export function App() {
  useSyncAllAvvio();
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="consulta" element={<Consultazione />} />
          <Route path="consulta/:codice" element={<SchedaProdotto />} />
          <Route path="sessioni/:id" element={<Sessione />} />
          <Route path="esportazioni" element={<Esportazioni />} />
          <Route path="impostazioni" element={<Impostazioni />} />
          <Route path="*" element={<Home />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
