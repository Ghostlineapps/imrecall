"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { pushSupabaseSession } from "@/lib/utils/nativeGeolocation";

/**
* Tiene allineato il lato nativo Android con la sessione Supabase corrente,
* così il servizio di tracking/geofencing in background (senza WebView) può
* autenticarsi verso le API con lo stesso utente. Su web/PWA
* pushSupabaseSession è un no-op (vedi nativeGeolocation.ts), quindi questo
* hook è sicuro da montare ovunque.
*/
export function useNativeSessionBridge() {
  useEffect(() => {
    const supabase = createClient();

    // Allinea subito con la sessione già presente al mount (es. dopo un
    // riavvio dell'app con sessione già valida), non solo sui cambi futuri.
    supabase.auth.getSession().then(({ data: { session } }) => {
      pushSupabaseSession(session);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      pushSupabaseSession(session);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);
}
