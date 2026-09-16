import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { noStoreJson } from "@/lib/http/noStore";

// Dati specifici dell'utente autenticato (email collegata, stato
// integrazione) — non deve mai essere cacheabile da un CDN o dal browser
// (vedi noStoreJson).
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabaseService = createServiceClient();
  const { data: integration } = await supabaseService
    .from("google_integrations")
    .select("google_email, connected_at, last_synced_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!integration) return noStoreJson({ connected: false });

  return noStoreJson({
    connected: true,
    google_email: integration.google_email,
    connected_at: integration.connected_at,
    last_synced_at: integration.last_synced_at,
  });
}
