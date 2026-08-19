import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const patch: Record<string, unknown> = {};

  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
  if (typeof body.dose === "string" || body.dose === null) patch.dose = body.dose;
  if (typeof body.active === "boolean") patch.active = body.active;
  if (Array.isArray(body.times)) {
    const times = Array.from(new Set(body.times)).filter(
      (t): t is string => typeof t === "string" && TIME_RE.test(t)
    ).sort();
    if (times.length === 0) {
      return NextResponse.json({ error: "at_least_one_time_required" }, { status: 400 });
    }
    patch.times = times;
  }

  const { data, error } = await supabase
    .from("medications")
    .update(patch)
    .eq("id", params.id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { error } = await supabase.from("medications").delete().eq("id", params.id).eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
