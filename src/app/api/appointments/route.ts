import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: appointments, error } = await supabase
    .from("appointments")
    .select("*")
    .eq("user_id", user.id)
    .eq("completed", false)
    .order("appointment_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ appointments });
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();

  const { data, error } = await supabase
    .from("appointments")
    .insert({
      user_id: user.id,
      title: body.title,
      appointment_at: body.appointment_at,
      location: body.location ?? null,
      notes: body.notes,
      reminder_minutes_before: body.reminder_minutes_before ?? [1440, 60],
      memory_id: body.memory_id,
      source: body.source ?? "manual",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
