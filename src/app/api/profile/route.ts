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
    .select("dietary_preferences, interests, monthly_budget, onboarding_completed")
    .eq("id", user.id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    dietary_preferences: profile?.dietary_preferences ?? [],
    interests: profile?.interests ?? [],
    monthly_budget: profile?.monthly_budget ?? null,
    // 2026-09-02: usato da useOnboardingGate per capire se un utente è
    // nuovo (mai completato /onboarding) — vedi quel hook e la migration
    // 029 per il backfill degli utenti già esistenti.
    onboarding_completed: profile?.onboarding_completed ?? true,
  });
}

export async function PATCH(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const update: Record<string, unknown> = {};

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
  // Impostato da /onboarding al termine del wizard (o se l'utente lo salta):
  // una volta true resta true, il flusso di onboarding non va più mostrato.
  if (typeof body.onboarding_completed === "boolean") {
    update.onboarding_completed = body.onboarding_completed;
  }
  // Budget mensile per la sezione Spese (migrazione 022) — null per
  // rimuoverlo (nessun limite impostato), un numero positivo per impostarlo.
  if (body.monthly_budget === null) {
    update.monthly_budget = null;
  } else if (body.monthly_budget !== undefined) {
    const budget = Number(body.monthly_budget);
    if (!Number.isFinite(budget) || budget < 0) {
      return NextResponse.json({ error: "invalid_monthly_budget" }, { status: 400 });
    }
    update.monthly_budget = budget;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });
  }

  const { error } = await supabase.from("profiles").update(update).eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
