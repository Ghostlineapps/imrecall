import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Scollega la chat Telegram dall'account — stesso principio di
// /api/integrations/google/disconnect e /microsoft/disconnect: azzera solo
// il collegamento, non tocca i ricordi già creati da lì.
export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("profiles")
    .update({ telegram_chat_id: null, telegram_link_code: null, telegram_link_code_expires_at: null })
    .eq("id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
