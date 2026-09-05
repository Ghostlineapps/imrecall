import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { reverseGeocodeBestName } from "@/lib/utils/geocoding";

// Risponde a "dove mi trovavo il [data] alle [ora]?": trova il punto di
// posizione registrato più vicino nel tempo al momento richiesto (prima o
// dopo, quale più vicino) e lo traduce in un nome di luogo leggibile.
export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const at = searchParams.get("at");
  if (!at) return NextResponse.json({ error: "missing_at" }, { status: 400 });

  const target = new Date(at);
  if (isNaN(target.getTime())) {
    return NextResponse.json({ error: "invalid_at" }, { status: 400 });
  }

  const [{ data: before }, { data: after }] = await Promise.all([
    supabase
      .from("location_checkins")
      .select("*")
      .eq("user_id", user.id)
      .lte("recorded_at", target.toISOString())
      .order("recorded_at", { ascending: false })
      .limit(1),
    supabase
      .from("location_checkins")
      .select("*")
      .eq("user_id", user.id)
      .gte("recorded_at", target.toISOString())
      .order("recorded_at", { ascending: true })
      .limit(1),
  ]);

  const candidates = [...(before ?? []), ...(after ?? [])];
  if (candidates.length === 0) {
    return NextResponse.json({ match: null });
  }

  const closest = candidates.reduce((best, c) => {
    const diff = Math.abs(new Date(c.recorded_at).getTime() - target.getTime());
    const bestDiff = Math.abs(new Date(best.recorded_at).getTime() - target.getTime());
    return diff < bestDiff ? c : best;
  });

  const placeName = closest.place_name || (await reverseGeocodeBestName(closest.latitude, closest.longitude));
  const diffMinutes = Math.round(
    Math.abs(new Date(closest.recorded_at).getTime() - target.getTime()) / 60000
  );

  return NextResponse.json({
    match: {
      latitude: closest.latitude,
      longitude: closest.longitude,
      recorded_at: closest.recorded_at,
      place_name: placeName,
      source: closest.source,
      diff_minutes: diffMinutes,
    },
  });
}
