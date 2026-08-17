import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Elenco degli ultimi spostamenti registrati (import da Google Maps +
// tracciamento live + check-in di prossimità), più recenti prima.
export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 200);

  const { data: locations, error } = await supabase
    .from("location_checkins")
    .select("*")
    .eq("user_id", user.id)
    .order("recorded_at", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ locations });
}
