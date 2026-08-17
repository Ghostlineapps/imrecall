import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: memory, error } = await supabase
    .from("memories")
    .select("*, memory_entities(entities(*)), memory_places(places(*))")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();

  if (error || !memory) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Memorie correlate per similarità embedding
  let related: any[] = [];
  if (memory.embedding) {
    const { data } = await supabase.rpc("match_memories", {
      query_embedding: memory.embedding,
      match_threshold: 0.75,
      match_count: 3,
      p_user_id: user.id,
    });
    related = (data ?? []).filter((m: any) => m.id !== memory.id);
  }

  return NextResponse.json({ ...memory, related });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const allowed = ["title", "content", "memory_date", "categories", "tags", "intention_status"];
  const patch = Object.fromEntries(
    Object.entries(body).filter(([k]) => allowed.includes(k))
  );

  const { data, error } = await supabase
    .from("memories")
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

  // Soft delete
  const { error } = await supabase
    .from("memories")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", params.id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
