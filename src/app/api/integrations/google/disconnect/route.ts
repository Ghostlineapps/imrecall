import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { decryptToken, revokeGoogleToken } from "@/lib/google/client";

export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabaseService = createServiceClient();
  const { data: integration } = await supabaseService
    .from("google_integrations")
    .select("refresh_token")
    .eq("user_id", user.id)
    .maybeSingle();

  if (integration?.refresh_token) {
    try {
      await revokeGoogleToken(decryptToken(integration.refresh_token));
    } catch (err) {
      console.error("Revoca token Google fallita, procedo comunque a scollegare", err);
    }
  }

  await supabaseService.from("google_integrations").delete().eq("user_id", user.id);
  await supabaseService.from("processed_gmail_messages").delete().eq("user_id", user.id);

  return NextResponse.json({ success: true });
}
