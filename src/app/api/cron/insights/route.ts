import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Cron giornaliero (vedi vercel.json, schedule "0 7 * * *"): per ogni
 * utente attivo, genera candidati di resurfacing in resurface_candidates.
 * Il motore in /api/insights/today sceglierà poi il migliore da mostrare.
 *
 * Copre: on_this_day, deadline (promemoria), pre_trip digest.
 * Il resurfacing di prossimità (proximity) è invece generato on-demand
 * quando arriva un location check-in — vedi /api/checkin/route.ts.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const today = new Date();
  const month = today.getMonth() + 1;
  const day = today.getDate();

  const { data: users } = await supabase.from("profiles").select("id");

  for (const u of users ?? []) {
    await generateOnThisDay(supabase, u.id, month, day);
    await generateDeadlineReminders(supabase, u.id);
    await generatePreTripDigests(supabase, u.id);
  }

  return NextResponse.json({ success: true, processed: users?.length ?? 0 });
}

async function generateOnThisDay(supabase: any, userId: string, month: number, day: number) {
  const { data: memories } = await supabase
    .from("memories")
    .select("id, content, title, memory_date")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .not("memory_date", "is", null);

  const matches = (memories ?? []).filter((m: any) => {
    const d = new Date(m.memory_date);
    return d.getMonth() + 1 === month && d.getDate() === day && d.getFullYear() < new Date().getFullYear();
  });

  if (matches.length === 0) return;

  // Preferisci il match più "vecchio" (nostalgia più forte) tra quelli disponibili
  const best = matches.sort(
    (a: any, b: any) => new Date(a.memory_date).getTime() - new Date(b.memory_date).getTime()
  )[0];

  const yearsAgo = new Date().getFullYear() - new Date(best.memory_date).getFullYear();

  await supabase.from("resurface_candidates").insert({
    user_id: userId,
    type: "on_this_day",
    memory_id: best.id,
    priority_score: 40 + Math.min(yearsAgo, 10), // ricordi più lontani hanno un piccolo bonus
    title: `${yearsAgo} anni fa, oggi`,
    body: (best.title || best.content || "").slice(0, 140),
  });
}

async function generateDeadlineReminders(supabase: any, userId: string) {
  const { data: deadlines } = await supabase
    .from("deadlines")
    .select("*")
    .eq("user_id", userId)
    .eq("completed", false);

  const today = new Date();

  for (const d of deadlines ?? []) {
    const due = new Date(d.due_date);
    const daysUntil = Math.ceil((due.getTime() - today.getTime()) / 86400000);

    if ((d.reminder_days_before ?? []).includes(daysUntil)) {
      // Priorità alta e crescente man mano che ci si avvicina alla scadenza
      const priority = 60 + Math.max(0, 15 - daysUntil);

      await supabase.from("resurface_candidates").insert({
        user_id: userId,
        type: "deadline",
        deadline_id: d.id,
        priority_score: priority,
        title: daysUntil <= 3 ? "Scadenza imminente" : "Scadenza in arrivo",
        body: `${d.title} — tra ${daysUntil} giorni (${d.due_date})`,
      });
    }
  }
}

async function generatePreTripDigests(supabase: any, userId: string) {
  const { data: trips } = await supabase
    .from("trips")
    .select("*, places(*)")
    .eq("user_id", userId)
    .eq("digest_sent", false);

  const today = new Date();

  for (const trip of trips ?? []) {
    const daysUntil = Math.ceil((new Date(trip.start_date).getTime() - today.getTime()) / 86400000);

    // Manda il digest 5 giorni prima della partenza
    if (daysUntil !== 5 || !trip.place_id) continue;

    const { data: intentions } = await supabase
      .from("memory_places")
      .select("memories(id, content, title)")
      .eq("place_id", trip.place_id)
      .limit(5);

    const openIntentions = (intentions ?? [])
      .map((i: any) => i.memories)
      .filter((m: any) => m);

    if (openIntentions.length === 0) continue;

    await supabase.from("resurface_candidates").insert({
      user_id: userId,
      type: "pre_trip",
      place_id: trip.place_id,
      priority_score: 80, // il pre-trip digest è tra i più preziosi: alta priorità
      title: `Parti tra 5 giorni per ${trip.destination}`,
      body: `Hai ${openIntentions.length} cose in sospeso lì: ${openIntentions
        .map((m: any) => m.title || m.content)
        .slice(0, 2)
        .join(", ")}…`,
    });

    await supabase.from("trips").update({ digest_sent: true }).eq("id", trip.id);
  }
}
