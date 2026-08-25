import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Feedback dell'utente su una card "Just Became Relevant" già mostrata
// (vedi TodayCard.tsx) — solo due valori per ora, nessuna logica di
// apprendimento automatico ancora collegata: prima raccogliamo il segnale,
// eventualmente in futuro lo useremo per pesare priority_score sul
// comportamento reale invece che sulla sola regola fissa per tipo.
// "not_useful" marca anche `dismissed` per coerenza con l'uso esistente
// della colonna, anche se la card non verrebbe comunque ripescata (è già
// `sent`) — vedi migrazione 023 per la colonna `feedback`.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { feedback } = await req.json();
  if (feedback !== "useful" && feedback !== "not_useful") {
    return NextResponse.json({ error: "invalid_feedback" }, { status: 400 });
  }

  const { error } = await supabase
    .from("resurface_candidates")
    .update({ feedback, dismissed: feedback === "not_useful" })
    .eq("id", params.id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
