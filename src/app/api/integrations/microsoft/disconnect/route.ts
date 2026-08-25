import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

// Niente chiamata di revoca: a differenza di Google, Microsoft non offre un
// endpoint REST per revocare un singolo refresh token lato server.
// Cancelliamo comunque subito il collegamento salvato — le prossime
// sincronizzazioni si fermano da sole perché non trovano più la riga in
// microsoft_integrations. Per una revoca completa lato Microsoft, l'utente
// può rimuovere il consenso da account.microsoft.com/consents.
export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabaseService = createServiceClient();
  await supabaseService.from("microsoft_integrations").delete().eq("user_id", user.id);
  await supabaseService.from("processed_outlook_messages").delete().eq("user_id", user.id);

  return NextResponse.json({ ok: true });
}
