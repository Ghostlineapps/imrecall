import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Salva una singola posizione GPS inviata dal browser durante il tracciamento live.
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const { latitude, longitude, accuracy, recorded_at } = body;

  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return NextResponse.json({ error: "invalid_coordinates" }, { status: 400 });
  }

  const { error } = await supabase.from("location_checkins").insert({
    user_id: user.id,
    latitude,
    longitude,
    accuracy: typeof accuracy === "number" ? accuracy : null,
    source: "live",
    recorded_at: recorded_at ?? new Date().toISOString(),
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
