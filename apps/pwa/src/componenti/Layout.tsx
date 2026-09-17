import { FileDown, House, Search, Settings, type LucideIcon } from 'lucide-react';
import { NavLink, Outlet } from 'react-router';
import { useOnline } from '../hooks/useOnline.js';
import { Avviso } from './Avviso.js';

const VOCI: { percorso: string; etichetta: string; Icona: LucideIcon; esatto?: boolean }[] = [
  { percorso: '/', etichetta: 'Home', Icona: House, esatto: true },
  { percorso: '/consulta', etichetta: 'Consulta', Icona: Search },
  { percorso: '/esportazioni', etichetta: 'Esportazioni', Icona: FileDown },
  { percorso: '/impostazioni', etichetta: 'Impostazioni', Icona: Settings },
];

/** Struttura comune: contenuto della rotta e barra inferiore a 4 voci. */
export function Layout() {
  const online = useOnline();
  return (
    <div
      className={`flex min-h-dvh flex-col ${
        online
          ? 'pb-[calc(76px+env(safe-area-inset-bottom))]'
          : 'pb-[calc(124px+env(safe-area-inset-bottom))]'
      }`}
    >
      <Outlet />
      <nav
        aria-label="Navigazione principale"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-grigio-bordo bg-bianco pb-[env(safe-area-inset-bottom)]"
      >
        {!online && (
          <Avviso tipo="avviso">Offline: lavori sul catalogo salvato nel telefono.</Avviso>
        )}
        <ul className="mx-auto grid h-[76px] max-w-xl grid-cols-4">
          {VOCI.map(({ percorso, etichetta, Icona, esatto }) => (
            <li key={percorso} className="flex">
              <NavLink
                to={percorso}
                end={esatto ?? false}
                className="group flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 text-sm text-grigio-testo aria-[current=page]:font-semibold aria-[current=page]:text-nero"
              >
                <span className="flex h-9 w-14 items-center justify-center rounded-full group-aria-[current=page]:bg-giallo">
                  <Icona size={28} strokeWidth={2} aria-hidden />
                </span>
                {etichetta}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
