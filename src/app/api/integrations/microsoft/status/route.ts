import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabaseService = createServiceClient();
  const { data: integration } = await supabaseService
    .from("microsoft_integrations")
    .select("microsoft_email, connected_at, last_synced_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!integration) return NextResponse.json({ connected: false });

  return NextResponse.json({
    connected: true,
    microsoft_email: integration.microsoft_email,
    connected_at: integration.connected_at,
    last_synced_at: integration.last_synced_at,
  });
}
