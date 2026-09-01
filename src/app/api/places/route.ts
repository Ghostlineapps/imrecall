import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/server";

const MAX_NAME_LENGTH = 60;

/**
* Salvataggio manuale di un luogo ("Luoghi" nelle impostazioni): a
* differenza di geocodeAndLinkPlace/geocodeAndLinkPlaceByCoords in
* classification.ts (che creano un luogo solo indirettamente, quando un
* ricordo lo nomina o una foto ha coordinate EXIF), questa route lo crea
* esplicitamente con le coordinate GPS attuali del dispositivo — è come
* l'utente imposta "Casa", "Lavoro", ecc.
*
* granularity è sempre "poi": una posizione presa dal GPS del telefono in
* quel momento è precisa quanto un punto d'interesse, non l'area vaga di
* una città. Upsert su (user_id, normalized_name): salvare di nuovo con lo
* stesso nome aggiorna le coordinate invece di duplicare la riga.
*/
export async function POST(req: NextRequest) {
const { supabase, user } = await getAuthenticatedUser(req);
if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

const body = await req.json().catch(() => null);
const name = typeof body?.name === "string" ? body.name.trim().slice(0, MAX_NAME_LENGTH) : "";
if (!name) return NextResponse.json({ error: "missing_name" }, { status: 400 });

const latitude = Number(body?.latitude);
const longitude = Number(body?.longitude);
if (
!Number.isFinite(latitude) ||
!Number.isFinite(longitude) ||
latitude < -90 ||
latitude > 90 ||
longitude < -180 ||
longitude > 180
) {
return NextResponse.json({ error: "invalid_coordinates" }, { status: 400 });
}

// Stessa normalizzazione usata in classification.ts, per restare
// compatibili con gli eventuali luoghi già creati da lì.
const normalized_name = name.toLowerCase().trim();

const { data: place, error } = await supabase
.from("places")
.upsert(
{
user_id: user.id,
name,
normalized_name,
latitude,
longitude,
granularity: "poi",
geocoded_at: new Date().toISOString(),
},
{ onConflict: "user_id,normalized_name" }
)
.select("id, name, latitude, longitude, granularity")
.single();

if (error) return NextResponse.json({ error: error.message }, { status: 500 });

return NextResponse.json({ place });
}

/** Rimuove un luogo salvato manualmente (o comunque uno qualsiasi dei
* propri luoghi) dalla pagina "Luoghi". */
export async function DELETE(req: NextRequest) {
const { supabase, user } = await getAuthenticatedUser(req);
if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

const body = await req.json().catch(() => null);
const id = typeof body?.id === "string" ? body.id : "";
if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

const { error } = await supabase.from("places").delete().eq("id", id).eq("user_id", user.id);

if (error) return NextResponse.json({ error: error.message }, { status: 500 });

return NextResponse.json({ ok: true });
}
