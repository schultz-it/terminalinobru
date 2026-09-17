import type { TipoSessione } from '@terminalinobru/core';
import { ClipboardList, PackagePlus, Truck, type LucideIcon } from 'lucide-react';

const ICONE: Record<TipoSessione, LucideIcon> = {
  inventario: ClipboardList,
  ddt: Truck,
  carico: PackagePlus,
};

/** Icona del tipo di sessione. */
export function IconaTipo({ tipo, size = 24 }: { tipo: TipoSessione; size?: number }) {
  const Icona = ICONE[tipo];
  return <Icona size={size} strokeWidth={2} aria-hidden />;
}
