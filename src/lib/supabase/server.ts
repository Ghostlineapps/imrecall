import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import type { Database } from "./types";

export function createClient() {
  const cookieStore = cookies();

  return createServerClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          // Chiamato da un Server Component: ignorabile se c'è il middleware
        // a rinfrescare la sessione.
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: "", ...options });
        } catch {
          // vedi sopra
        }
      },
    },
  }
  );
}

// Client con service role, solo per operazioni server-side privilegiate
// (webhook Stripe, cron job). MAI esporlo al client.
export function createServiceClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
    );
}

// Autentica una richiesta sia via cookie di sessione (browser) sia via
// header di autorizzazione con token JWT dell'utente (client nativi, es. il
// servizio Android in background per geofencing/tracking posizione, che
// non ha una WebView/cookie a disposizione).
//
// Il token va passato anche come header al client Supabase (non solo a
// auth.getUser()): è quello che fa sì che le successive query .from(...)
// vengano eseguite da PostgREST come quell'utente, rispettando la RLS,
// esattamente come succede col client basato su cookie.
export async function getAuthenticatedUser(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const bearerToken = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];

if (bearerToken) {
  const supabase = createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${bearerToken}` } },
    }
    );
  const { data: { user }, error } = await supabase.auth.getUser(bearerToken);
  return { supabase, user: error ? null : user };
}

const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}
