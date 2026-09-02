import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// 2026-09-02: src/lib/supabase/server.ts contiene già da tempo un commento
// che presuppone l'esistenza di questo file ("ignorabile se c'è il
// middleware a rinfrescare la sessione" nel gestore cookie set/remove) —
// ma il middleware non era mai stato creato. I Server Component non
// possono scrivere cookie (limite di Next.js): se l'access token era
// scaduto, veniva sì rinfrescato per quel singolo render, ma il nuovo
// token non veniva MAI salvato nei cookie del browser (il set/remove in
// server.ts fallisce silenziosamente in quel contesto). Alla richiesta
// successiva il browser rimandava ancora il vecchio cookie scaduto, e il
// ciclo si ripeteva. Nell'app nativa Android — che carica pagine reali dal
// server (non è una SPA pura) — questo si manifestava come login richiesto
// "ogni tanto", tipicamente dopo che l'app era rimasta in background
// abbastanza a lungo da far scadere l'access token (~1 ora).
//
// Questo middleware gira su ogni richiesta reale al server (vedi matcher
// sotto) e chiama supabase.auth.getUser(): se l'access token è scaduto ma
// il refresh token è ancora valido, la libreria lo rinnova da sola, e
// stavolta il nuovo token viene effettivamente salvato nei cookie della
// risposta grazie ai gestori set/remove qui sotto (che, a differenza di
// quelli in server.ts, girano in un contesto dove scrivere cookie è
// permesso).
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: "", ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  // IMPORTANTE: non aggiungere logica tra createServerClient e
  // getUser() — è questa chiamata che innesca il refresh automatico.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  // Esclude asset statici e le immagini ottimizzate di Next.js: non hanno
  // bisogno di un check sessione, ed escluderli evita lavoro inutile su
  // ogni singolo file statico caricato dalla pagina.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
