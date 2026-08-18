import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DIETARY_VALUES, INTEREST_VALUES } from "@/lib/constants/preferences";

// Preferenze di profilo (dieta + interessi) lette/scritte da
// /settings/profile e consumate da /api/places/nearby per filtrare i
// consigli vicino all'utente.
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("dietary_preferences, interests")
    .eq("id", user.id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    dietary_preferences: profile?.dietary_preferences ?? [],
    interests: profile?.interests ?? [],
  });
}

export async function PATCH(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const update: Record<string, string[]> = {};

  // Validiamo contro il set chiuso di opzioni: valori sconosciuti vengono
  // scartati silenziosamente invece di rifiutare la richiesta, così il
  // client può inviare l'intero array selezionato senza dover conoscere la
  // lista valida lato server.
  if (Array.isArray(body.dietary_preferences)) {
    update.dietary_preferences = body.dietary_preferences.filter((v: unknown) =>
      DIETARY_VALUES.includes(v as string)
    );
  }
  if (Array.isArray(body.interests)) {
    update.interests = body.interests.filter((v: unknown) => INTEREST_VALUES.includes(v as string));
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });
  }

  const { error } = await supabase.from("profiles").update(update).eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
