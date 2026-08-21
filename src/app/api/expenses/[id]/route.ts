import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const CATEGORIES = ["spesa", "trasporti", "ristorazione", "casa", "salute", "svago", "altro"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// PATCH /api/expenses/[id] — usata dalla pagina /expenses per correggere
// una spesa creata dalla lettura automatica dello scontrino (importo,
// negozio, categoria o data letti male dalla foto) o per modificare una
// spesa inserita a mano.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};

  if (body.amount !== undefined) {
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
    }
    patch.amount = amount;
  }
  if (body.category !== undefined) {
    if (!CATEGORIES.includes(body.category)) {
      return NextResponse.json({ error: "invalid_category" }, { status: 400 });
    }
    patch.category = body.category;
  }
  if (body.expense_date !== undefined) {
    if (!DATE_RE.test(body.expense_date)) {
      return NextResponse.json({ error: "invalid_date" }, { status: 400 });
    }
    patch.expense_date = body.expense_date;
  }
  if (body.vendor !== undefined) {
    patch.vendor = typeof body.vendor === "string" ? body.vendor.trim().slice(0, 200) || null : null;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });
  }
  patch.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("expenses")
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { error } = await supabase.from("expenses").delete().eq("id", params.id).eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
