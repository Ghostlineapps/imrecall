import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/server";

const MAX_MESSAGE_LENGTH = 200;

/**
 * Promemoria "quando arrivo a [luogo], ricordami di [testo]" (es. "quando
 * arrivo a casa oggi ricordami di innaffiare le piante" — richiesta
 * dell'utente il 2026-09-10). Diverso dalle intenzioni (memories con
 * is_intention=true, tipo "voglio tornare al ristorante X"): quelle restano
 * aperte finché non le completi manualmente e competono per l'unico slot
 * giornaliero di TodayCard; questo è pensato per essere usa-e-getta, legato
 * a UN luogo già salvato, si spegne da solo al primo arrivo entro raggio
 * (vedi /api/checkin/route.ts) e arriva anche come notifica push, non solo
 * se riapri l'app.
 */
export async function GET(req: NextRequest) {
  const { supabase, user } = await getAuthenticatedUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: reminders, error } = await supabase
    .from("arrival_reminders")
    .select("id, message, place_id, triggered, triggered_at, created_at, places(name)")
    .eq("user_id", user.id)
    .eq("triggered", false)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ reminders: reminders ?? [] });
}

export async function POST(req: NextRequest) {
  const { supabase, user } = await getAuthenticatedUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const place_id = typeof body?.place_id === "string" ? body.place_id : "";
  const message = typeof body?.message === "string" ? body.message.trim().slice(0, MAX_MESSAGE_LENGTH) : "";

  if (!place_id || !message) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  // Verifica che il luogo appartenga davvero all'utente autenticato, non
  // solo che esista: altrimenti basterebbe indovinare un place_id altrui
  // per agganciarci un promemoria.
  const { data: place } = await supabase
    .from("places")
    .select("id")
    .eq("id", place_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!place) return NextResponse.json({ error: "place_not_found" }, { status: 404 });

  const { data: reminder, error } = await supabase
    .from("arrival_reminders")
    .insert({ user_id: user.id, place_id, message })
    .select("id, message, place_id, triggered, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ reminder });
}

/** Annulla un promemoria non ancora innescato (es. l'utente cambia idea). */
export async function DELETE(req: NextRequest) {
  const { supabase, user } = await getAuthenticatedUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const { error } = await supabase.from("arrival_reminders").delete().eq("id", id).eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
