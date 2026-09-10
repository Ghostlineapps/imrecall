"use client";

import { useState } from "react";
import useSWR from "swr";
import { ensureNativeLocationPermission } from "@/lib/utils/nativeGeolocation";

interface Place {
id: string;
name: string;
latitude: number;
longitude: number;
granularity: string;
excluded_from_resurfacing: boolean;
}

interface ArrivalReminder {
id: string;
message: string;
place_id: string;
places: { name: string } | null;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function PlacesPage() {
const { data, mutate, isLoading } = useSWR<{ places: Place[] }>("/api/places/mine", fetcher);
const { data: remindersData, mutate: mutateReminders } = useSWR<{ reminders: ArrivalReminder[] }>(
"/api/arrival-reminders",
fetcher
);

const [name, setName] = useState("");
const [saving, setSaving] = useState(false);
const [error, setError] = useState<string | null>(null);
const [removingId, setRemovingId] = useState<string | null>(null);
const [togglingId, setTogglingId] = useState<string | null>(null);

const [reminderPlaceId, setReminderPlaceId] = useState("");
const [reminderMessage, setReminderMessage] = useState("");
const [savingReminder, setSavingReminder] = useState(false);
const [reminderError, setReminderError] = useState<string | null>(null);
const [cancelingReminderId, setCancelingReminderId] = useState<string | null>(null);

const trimmedName = name.trim();
const trimmedReminderMessage = reminderMessage.trim();

async function handleSave() {
if (!trimmedName) return;
setSaving(true);
setError(null);

try {
// Su Android serve chiedere esplicitamente il permesso nativo prima:
// vedi la nota in nativeGeolocation.ts, senza questa chiamata
// navigator.geolocation fallisce sempre in silenzio dentro l'app.
await ensureNativeLocationPermission();

const position = await new Promise<GeolocationPosition>((resolve, reject) => {
navigator.geolocation.getCurrentPosition(resolve, reject, {
enableHighAccuracy: true,
maximumAge: 0,
timeout: 20000,
});
});

const res = await fetch("/api/places", {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify({
name: trimmedName,
latitude: position.coords.latitude,
longitude: position.coords.longitude,
}),
});

if (!res.ok) {
throw new Error("save_failed");
}

setName("");
await mutate();
} catch (err) {
if (err instanceof GeolocationPositionError || (err && typeof err === "object" && "code" in err)) {
setError("Non riesco a leggere la posizione. Controlla che il permesso di localizzazione sia attivo.");
} else {
setError("Non sono riuscito a salvare il luogo. Riprova.");
}
} finally {
setSaving(false);
}
}

async function handleRemove(id: string) {
setRemovingId(id);
try {
await fetch("/api/places", {
method: "DELETE",
headers: { "Content-Type": "application/json" },
body: JSON.stringify({ id }),
});
await mutate();
} finally {
setRemovingId(null);
}
}

// Aggiornamento ottimistico: l'interruttore risponde subito, senza
// aspettare il giro di rete — l'unico rischio è doverlo far tornare
// indietro nel raro caso di errore, non farlo restare "in ritardo" a ogni
// tocco.
async function handleToggleExclude(place: Place) {
setTogglingId(place.id);
const nextValue = !place.excluded_from_resurfacing;
await mutate(
(current) =>
current && {
places: current.places.map((p) => (p.id === place.id ? { ...p, excluded_from_resurfacing: nextValue } : p)),
},
{ revalidate: false }
);

try {
await fetch("/api/places", {
method: "PATCH",
headers: { "Content-Type": "application/json" },
body: JSON.stringify({ id: place.id, excluded_from_resurfacing: nextValue }),
});
} finally {
setTogglingId(null);
await mutate();
}
}

// "Quando arrivo a [luogo], ricordami di [testo]" — promemoria usa-e-getta
// legato a un luogo già salvato (vedi migrazione 032): si spegne da solo
// al primo arrivo entro un raggio ristretto e arriva anche come notifica
// push, non solo se riapri l'app. Diverso da "Ricorda" nella scheda di
// oggi, che riguarda ricordi passati, non un compito da fare.
async function handleCreateReminder() {
if (!reminderPlaceId || !trimmedReminderMessage) return;
setSavingReminder(true);
setReminderError(null);

try {
const res = await fetch("/api/arrival-reminders", {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify({ place_id: reminderPlaceId, message: trimmedReminderMessage }),
});

if (!res.ok) throw new Error("save_failed");

setReminderMessage("");
await mutateReminders();
} catch {
setReminderError("Non sono riuscito a salvare il promemoria. Riprova.");
} finally {
setSavingReminder(false);
}
}

async function handleCancelReminder(id: string) {
setCancelingReminderId(id);
try {
await fetch("/api/arrival-reminders", {
method: "DELETE",
headers: { "Content-Type": "application/json" },
body: JSON.stringify({ id }),
});
await mutateReminders();
} finally {
setCancelingReminderId(null);
}
}

const places = data?.places ?? [];
const reminders = remindersData?.reminders ?? [];

return (
<div className="bg-celeste-bg min-h-full px-4 pt-6 pb-4 space-y-6 text-celeste-navy">
<div>
<h1 className="text-xl font-semibold">Luoghi</h1>
<p className="text-sm text-celeste-muted mt-1">
Salva la posizione attuale con un nome (es. &quot;Casa&quot;, &quot;Lavoro&quot;) per ricevere
promemoria quando arrivi lì.
</p>
</div>

<div className="card-light space-y-3">
<label className="block">
<span className="text-sm font-medium">Nome del luogo</span>
<input
type="text"
value={name}
onChange={(e) => setName(e.target.value)}
placeholder="Casa, Lavoro, ..."
className="input-field-light mt-1 w-full"
maxLength={60}
/>
</label>

<button onClick={handleSave} disabled={!trimmedName || saving} className="btn-primary-light w-full">
{saving ? "Salvo la posizione..." : trimmedName ? `Salva qui come "${trimmedName}"` : "Salva qui come..."}
</button>

{error && <p className="text-xs text-urgent">{error}</p>}

<p className="text-xs text-celeste-muted">
Usa la posizione del telefono in questo momento: assicurati di essere già nel posto che vuoi salvare.
</p>
</div>

<div className="space-y-2">
<h2 className="text-sm font-medium text-celeste-muted">I tuoi luoghi</h2>

{isLoading && <p className="text-sm text-celeste-muted">Carico...</p>}

{!isLoading && places.length === 0 && (
<p className="text-sm text-celeste-muted">Non hai ancora salvato nessun luogo.</p>
)}

{places.map((place) => (
<div key={place.id} className="card-light space-y-2">
<div className="flex items-center justify-between">
<p className="font-medium">{place.name}</p>
<button
onClick={() => handleRemove(place.id)}
disabled={removingId === place.id}
className="text-xs text-celeste-accent"
>
{removingId === place.id ? "Rimuovo..." : "Rimuovi"}
</button>
</div>

{/* Senza questo interruttore, un luogo come "Casa" (dove passi la
maggior parte del tempo) fa ricomparire in loop qualsiasi ricordo
o intenzione collegata ad ogni check-in — vedi migrazione 032.
Non ha senso "ricordarti" che sei tornato dove vivi. */}
<label className="flex items-center gap-2 text-xs text-celeste-muted">
<input
type="checkbox"
checked={place.excluded_from_resurfacing}
disabled={togglingId === place.id}
onChange={() => handleToggleExclude(place)}
className="shrink-0"
/>
Escludi dai promemoria di prossimità (&quot;Sei di nuovo qui&quot;)
</label>
</div>
))}
</div>

<div className="space-y-3 border-t border-celeste-navy/10 pt-6">
<div>
<h2 className="text-sm font-medium text-celeste-navy">Promemoria quando arrivi</h2>
<p className="text-xs text-celeste-muted mt-1">
Es. &quot;quando arrivo a casa, ricordami di innaffiare le piante&quot;. Scatta una sola volta, appena
arrivi, anche con l&apos;app chiusa.
</p>
</div>

<div className="card-light space-y-3">
<label className="block">
<span className="text-sm font-medium">Luogo</span>
<select
value={reminderPlaceId}
onChange={(e) => setReminderPlaceId(e.target.value)}
className="input-field-light mt-1 w-full"
disabled={places.length === 0}
>
<option value="">Scegli un luogo salvato...</option>
{places.map((place) => (
<option key={place.id} value={place.id}>
{place.name}
</option>
))}
</select>
</label>

<label className="block">
<span className="text-sm font-medium">Ricordami di...</span>
<input
type="text"
value={reminderMessage}
onChange={(e) => setReminderMessage(e.target.value)}
placeholder="Innaffiare le piante"
className="input-field-light mt-1 w-full"
maxLength={200}
/>
</label>

<button
onClick={handleCreateReminder}
disabled={!reminderPlaceId || !trimmedReminderMessage || savingReminder}
className="btn-primary-light w-full"
>
{savingReminder ? "Salvo..." : "Ricordami"}
</button>

{reminderError && <p className="text-xs text-urgent">{reminderError}</p>}
{places.length === 0 && (
<p className="text-xs text-celeste-muted">Salva prima almeno un luogo qui sopra.</p>
)}
</div>

{reminders.length > 0 && (
<div className="space-y-2">
{reminders.map((reminder) => (
<div key={reminder.id} className="card-light flex items-center justify-between gap-3">
<div className="min-w-0">
<p className="text-sm font-medium truncate">{reminder.message}</p>
<p className="text-xs text-celeste-muted">Quando arrivi a {reminder.places?.name ?? "questo luogo"}</p>
</div>
<button
onClick={() => handleCancelReminder(reminder.id)}
disabled={cancelingReminderId === reminder.id}
className="text-xs text-celeste-accent shrink-0"
>
{cancelingReminderId === reminder.id ? "Annullo..." : "Annulla"}
</button>
</div>
))}
</div>
)}
</div>
</div>
);
}
