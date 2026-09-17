import { RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { formattaDataOra } from '../formato.js';
import { useImpostazioni } from '../hooks/useImpostazioni.js';
import { useOnline } from '../hooks/useOnline.js';
import { useStatoSync } from '../sync/statoSync.js';

/** Online/offline e data dell'ultima sincronizzazione del catalogo. */
export function StatoRete() {
  const online = useOnline();
  const { impostazioni } = useImpostazioni();
  const { inCorso } = useStatoSync();
  return (
    <div className="flex items-center gap-3" data-test="stato-rete">
      <span
        className={`flex size-10 shrink-0 items-center justify-center rounded-full text-bianco ${
          online ? 'bg-verde' : 'bg-arancio'
        }`}
      >
        {online ? <Wifi size={22} strokeWidth={2} /> : <WifiOff size={22} strokeWidth={2} />}
      </span>
      <div className="min-w-0">
        <p className="font-semibold">{online ? 'Online' : 'Offline'}</p>
        <p className="etichetta flex items-center gap-1">
          {inCorso ? (
            <>
              <RefreshCw size={14} className="animate-spin" /> Sincronizzazione in corso…
            </>
          ) : (
            <>Ultima sincronizzazione: {formattaDataOra(impostazioni?.ultimaSincronizzazione)}</>
          )}
        </p>
      </div>
    </div>
  );
}
