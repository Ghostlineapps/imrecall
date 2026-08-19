import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/signup", "/callback", "/", "/privacy", "/terms"];

export async function middleware(request: NextRequest) {
  // Le route API gestiscono da sole l'autenticazione (supabase.auth.getUser()
  // dentro ogni route handler, con risposta JSON 401 se manca la sessione).
  // Senza questo bypass, chiamate server-to-server senza cookie di sessione —
  // come quella di pg_cron verso /api/cron/medications ogni minuto — venivano
  // reindirizzate silenziosamente alla pagina HTML di /login invece di
  // arrivare al route handler, e il promemoria farmaco non partiva mai.
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublic = PUBLIC_PATHS.some(
    (path) => request.nextUrl.pathname === path
  );

  if (!user && !isPublic) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && (request.nextUrl.pathname === "/login" || request.nextUrl.pathname === "/signup")) {
    return NextResponse.redirect(new URL("/home", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)",
  ],
};
