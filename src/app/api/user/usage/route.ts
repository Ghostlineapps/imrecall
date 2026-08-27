import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  FREE_MEMORIES_PER_MONTH,
  memoriesUsedThisMonth,
  transcriptionMinutesQuota,
  transcriptionMinutesUsedThisMonth,
} from "@/lib/subscription/limits";
import { FOUNDER_SEATS_TOTAL } from "@/lib/stripe/client";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_tier, memory_count_total, storage_bytes_used")
    .eq("id", user.id)
    .single();

  const tier = profile?.subscription_tier;

  // Conteggi live, non colonne salvate: `memory_count_this_month` non
  // veniva mai incrementato da nessun codice (vedi
  // src/lib/subscription/limits.ts), quindi mostrava sempre 0 qui.
  //
  // Il conteggio dei posti Founder venduti richiede il service client: la
  // RLS su profiles ("profiles_own") permette a ogni utente di leggere
  // solo la propria riga, non un conteggio su tutti gli utenti — vedi
  // stessa nota in src/app/api/checkout/route.ts. Il filtro su
  // stripe_customer_id esclude i posti Founder assegnati a mano (SQL
  // diretto, non tramite Stripe) dal conteggio dei 50 posti a pagamento.
  const admin = createServiceClient();
  const [memoriesThisMonth, transcriptionMinutes, founderResult] = await Promise.all([
    memoriesUsedThisMonth(supabase, user.id),
    transcriptionMinutesUsedThisMonth(supabase, user.id),
    admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("subscription_tier", "founder")
      .not("stripe_customer_id", "is", null),
  ]);
  const founderCount: number = founderResult.count ?? 0;

  return NextResponse.json({
    ...profile,
    memory_count_this_month: memoriesThisMonth,
    memory_limit_this_month: FREE_MEMORIES_PER_MONTH,
    transcription_minutes_this_month: Math.round(transcriptionMinutes),
    transcription_minutes_limit: transcriptionMinutesQuota(tier),
    founder_seats_remaining: Math.max(0, FOUNDER_SEATS_TOTAL - founderCount),
  });
}
