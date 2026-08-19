import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const RECURRENCE_TYPES = ["daily", "weekly", "interval", "monthly"];

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

  // Ricorrenza (migrazione 019) — tutta opzionale in PATCH: se il body
  // include recurrence_type, ricalcoliamo insieme i campi collegati (stessa
  // logica di validazione di POST /api/medications), altrimenti i campi di
  // ricorrenza restano quelli già salvati.
  if (typeof body.recurrence_type === "string") {
    if (!RECURRENCE_TYPES.includes(body.recurrence_type)) {
      return NextResponse.json({ error: "invalid_recurrence_type" }, { status: 400 });
    }
    patch.recurrence_type = body.recurrence_type;
    patch.days_of_week = null;
    patch.interval_days = null;
    patch.interval_anchor_date = null;
    patch.day_of_month = null;

    if (body.recurrence_type === "weekly") {
      const rawDays: unknown[] = Array.isArray(body.days_of_week) ? body.days_of_week : [];
      const daysSet = new Set<number>();
      for (const d of rawDays) {
        if (typeof d === "number" && Number.isInteger(d) && d >= 0 && d <= 6) daysSet.add(d);
      }
      const days = Array.from(daysSet).sort((a, b) => a - b);
      if (days.length === 0) return NextResponse.json({ error: "days_of_week_required" }, { status: 400 });
      patch.days_of_week = days;
    }

    if (body.recurrence_type === "interval") {
      const intervalDays = Number(body.interval_days);
      if (!Number.isInteger(intervalDays) || intervalDays < 1) {
        return NextResponse.json({ error: "invalid_interval_days" }, { status: 400 });
      }
      patch.interval_days = intervalDays;
      patch.interval_anchor_date =
        typeof body.interval_anchor_date === "string" && DATE_RE.test(body.interval_anchor_date)
          ? body.interval_anchor_date
          : null;
    }

    if (body.recurrence_type === "monthly") {
      const dayOfMonth = Number(body.day_of_month);
      if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
        return NextResponse.json({ error: "invalid_day_of_month" }, { status: 400 });
      }
      patch.day_of_month = dayOfMonth;
    }
  }

  if (typeof body.start_date === "string" || body.start_date === null) {
    patch.start_date = typeof body.start_date === "string" && DATE_RE.test(body.start_date) ? body.start_date : null;
  }
  if (typeof body.end_date === "string" || body.end_date === null) {
    patch.end_date = typeof body.end_date === "string" && DATE_RE.test(body.end_date) ? body.end_date : null;
  }
  if (
    typeof patch.start_date === "string" &&
    typeof patch.end_date === "string" &&
    patch.start_date > patch.end_date
  ) {
    return NextResponse.json({ error: "end_date_before_start_date" }, { status: 400 });
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
