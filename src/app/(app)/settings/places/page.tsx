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
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function PlacesPage() {
const { data, mutate, isLoading } = useSWR<{ places: Place[] }>("/api/places/mine", fetcher);
const [name, setName] = useState("");
const [saving, setSaving] = useState(false);
const [error, setError] = useState<string | null>(null);
const [removingId, setRemovingId] = useState<string | null>(null);

const trimmedName = name.trim();

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

const places = data?.places ?? [];

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
<div key={place.id} className="card-light flex items-center justify-between">
<p className="font-medium">{place.name}</p>
<button
onClick={() => handleRemove(place.id)}
disabled={removingId === place.id}
className="text-xs text-celeste-accent"
>
{removingId === place.id ? "Rimuovo..." : "Rimuovi"}
</button>
</div>
))}
</div>
</div>
);
}
