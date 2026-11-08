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
    .from("microsoft_integrations")
    .select("microsoft_email, connected_at, last_synced_at, reauth_required")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!integration) return noStoreJson({ connected: false });

  // Vedi commento gemello in /api/integrations/google/status: un token
  // scaduto in modo permanente lascia la riga al suo posto (serve a
  // recuperare retroattivamente al ricollegamento) ma la UI deve mostrare
  // "Connetti Outlook", non "Collegato".
  if (integration.reauth_required) {
    return noStoreJson({
      connected: false,
      reauth_required: true,
      microsoft_email: integration.microsoft_email,
    });
  }

  return noStoreJson({
    connected: true,
    microsoft_email: integration.microsoft_email,
    connected_at: integration.connected_at,
    last_synced_at: integration.last_synced_at,
  });
}
