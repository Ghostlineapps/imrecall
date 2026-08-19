"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, HelpCircle } from "lucide-react";
import clsx from "clsx";

// Ridotta da 6 a 2 voci: Chat/Ricordi/Calendario/Scadenze/Impostazioni sono
// già raggiungibili dal cerchio in Dashboard (DashboardHub.tsx) — tenerle
// anche qui era una barra ridondante che duplicava il cerchio senza motivo.
// Restano solo le due cose che il cerchio non copre: tornare alla Dashboard
// da qualunque altra schermata, e la guida rapida per chi non ha capito
// cosa fa un pulsante (il problema che ha fatto partire questo redesign).
const ITEMS = [
  { href: "/home", label: "Dashboard", icon: Home },
  { href: "/guide", label: "Istruzioni", icon: HelpCircle },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-surface/95 backdrop-blur border-t border-white/10 flex justify-around py-2 px-2 z-20">
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={clsx(
              "flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-colors text-xs",
              active ? "text-primary-light" : "text-white/40 hover:text-white/70"
            )}
          >
            <Icon size={20} strokeWidth={active ? 2.4 : 1.8} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
