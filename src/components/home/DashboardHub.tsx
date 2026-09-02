"use client";

import { useState } from "react";
import Link from "next/link";
import { Clock, MessageCircle, CalendarDays, CalendarClock, Settings, Plus, HeartPulse, Receipt, Baby } from "lucide-react";
import { CaptureSheet } from "@/components/capture/CaptureSheet";

// 8 destinazioni oltre a Dashboard: la barra in basso è stata ridotta a
// Dashboard + Istruzioni proprio perché duplicava questo cerchio senza
// motivo (vedi BottomNav.tsx). "Salute", "Spese" e "Gravidanza" non
// introducono una nuova categorizzazione — sono solo punti d'ingresso
// visibili per far capire che si possono caricare referti/esami (vedi
// /health, migrazione 020), scontrini (vedi /expenses, migrazione 022) o
// organizzare visite/esami/scadenze di una gravidanza (vedi /gravidanza,
// migrazione 028): senza questi bottoni, nessuno penserebbe di farlo.
const ITEMS = [
{ href: "/timeline", label: "Ricordi", icon: Clock },
{ href: "/chat", label: "Chat", icon: MessageCircle },
{ href: "/appointments", label: "Calendario", icon: CalendarDays },
{ href: "/deadlines", label: "Scadenze", icon: CalendarClock },
{ href: "/health", label: "Salute", icon: HeartPulse },
{ href: "/gravidanza", label: "Gravidanza", icon: Baby },
{ href: "/expenses", label: "Spese", icon: Receipt },
{ href: "/settings", label: "Impostazioni", icon: Settings },
];

const CENTER_Y = 176;
const RING_R = 148;
const BTN_SIZE = 76;

function polar(r: number, angleDeg: number) {
const a = (angleDeg * Math.PI) / 180;
return { x: r * Math.cos(a), y: r * Math.sin(a) };
}

export function DashboardHub() {
const [sheetOpen, setSheetOpen] = useState(false);

return (
<div className="relative mx-auto" style={{ width: RING_R * 2 + BTN_SIZE, height: CENTER_Y + RING_R + BTN_SIZE / 2 }}>
{/* Bagliore sfocato dietro al cerchio: senza, il cerchio galleggia su
uno sfondo piatto senza alcuna profondità — vedi redesign
2026-08-21 ("pagina troppo piatta"). */}
<div
className="absolute rounded-full bg-celeste-accent/10 blur-3xl pointer-events-none"
style={{
width: RING_R * 2.1,
height: RING_R * 2.1,
left: RING_R + BTN_SIZE / 2 - RING_R * 1.05,
top: CENTER_Y - RING_R * 1.05,
}}
/>

{/* Guida visiva del cerchio */}
<div
className="absolute rounded-full border-2 border-dashed border-celeste-accent/25"
style={{
width: RING_R * 2,
height: RING_R * 2,
left: RING_R + BTN_SIZE / 2 - RING_R,
top: CENTER_Y - RING_R,
}}
/>

{ITEMS.map((it, i) => {
const angle = -90 + i * (360 / ITEMS.length);
const { x, y } = polar(RING_R, angle);
const Icon = it.icon;
return (
<Link
key={it.href}
href={it.href}
className="absolute flex flex-col items-center gap-1.5 group"
style={{
width: BTN_SIZE,
left: RING_R + BTN_SIZE / 2 + x - BTN_SIZE / 2,
top: CENTER_Y + y - BTN_SIZE / 2,
}}
>
<span className="w-full aspect-square rounded-full bg-gradient-to-br from-celeste-accent to-celeste-accentDark flex items-center justify-center text-white shadow-lg shadow-celeste-navy/25 transition-transform duration-150 group-hover:scale-105 group-active:scale-95">
<Icon size={26} strokeWidth={1.8} />
</span>
<span className="text-xs font-semibold text-celeste-navy">{it.label}</span>
</Link>
);
})}

<button
onClick={() => setSheetOpen(true)}
className="absolute rounded-full flex flex-col items-center justify-center gap-1 bg-gradient-to-br from-celeste-accent to-celeste-accentDark text-white shadow-xl shadow-celeste-navy/30 transition-transform duration-150 hover:scale-105 active:scale-95"
style={{
width: BTN_SIZE * 1.55,
height: BTN_SIZE * 1.55,
left: RING_R + BTN_SIZE / 2 - (BTN_SIZE * 1.55) / 2,
top: CENTER_Y - (BTN_SIZE * 1.55) / 2,
}}
aria-label="Aggiungi un ricordo"
>
<Plus size={30} />
</button>
<p className="absolute text-center text-xs font-semibold text-celeste-accentDark" style={{ left: 0, right: 0, top: CENTER_Y + BTN_SIZE * 1.55 / 2 + 8 }}>
Tocca per aggiungere
</p>

<CaptureSheet open={sheetOpen} onClose={() => setSheetOpen(false)} initialTab="text" />
</div>
);
}
