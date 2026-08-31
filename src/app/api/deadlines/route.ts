import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const isPregnancy = searchParams.get("is_pregnancy");

  let query = supabase
    .from("deadlines")
    .select("*")
    .eq("user_id", user.id)
    .eq("completed", false)
    .order("due_date", { ascending: true });

  // Usato dalla sezione Gravidanza (vedi migrazione 028), stesso pattern
  // di is_health sui ricordi.
  if (isPregnancy === "true") query = query.eq("is_pregnancy", true);

  const { data: deadlines, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deadlines });
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();

  const { data, error } = await supabase
    .from("deadlines")
    .insert({
      user_id: user.id,
      title: body.title,
      category: body.category ?? "altro",
      due_date: body.due_date,
      recurrence: body.recurrence ?? "none",
      reminder_days_before: body.reminder_days_before ?? [15, 3],
      amount: body.amount,
      notes: body.notes,
      memory_id: body.memory_id,
      is_pregnancy: body.is_pregnancy ?? false,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
