import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  FREE_MEMORIES_PER_MONTH,
  memoriesUsedThisMonth,
  transcriptionMinutesQuota,
  transcriptionMinutesUsedThisMonth,
} from "@/lib/subscription/limits";

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
  const [memoriesThisMonth, transcriptionMinutes] = await Promise.all([
    memoriesUsedThisMonth(supabase, user.id),
    transcriptionMinutesUsedThisMonth(supabase, user.id),
  ]);

  return NextResponse.json({
    ...profile,
    memory_count_this_month: memoriesThisMonth,
    memory_limit_this_month: FREE_MEMORIES_PER_MONTH,
    transcription_minutes_this_month: Math.round(transcriptionMinutes),
    transcription_minutes_limit: transcriptionMinutesQuota(tier),
  });
}
