// src/hooks/useOnboardingGate.ts
//
// Manda i nuovi utenti (profiles.onboarding_completed = false) su
// /onboarding prima di lasciarli usare il resto dell'app, così il primo
// "momento wow" (import + ricordi ritrovati) non è un passo facoltativo
// che quasi nessuno troverebbe da solo in Impostazioni. Montato una sola
// volta in (app)/layout.tsx, che avvolge ogni schermata sotto (app) —
// /onboarding stessa vive fuori da quel gruppo di route apposta, per non
// ricontrollare/reindirizzare mentre l'utente è già lì.
//
// Fail-open per design: se la chiamata a /api/profile fallisce (rete
// assente, errore server), NON reindirizziamo — un utente esistente non
// deve restare bloccato fuori dall'app per un problema di rete. Il
// controllo riparte al prossimo montaggio (refresh, nuova apertura app).

"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export function useOnboardingGate() {
  const router = useRouter();
  const checked = useRef(false);

  useEffect(() => {
    if (checked.current) return;
    checked.current = true;

    (async () => {
      try {
        const res = await fetch("/api/profile");
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        if (data?.onboarding_completed === false) {
          router.replace("/onboarding");
        }
      } catch {
        // Fail-open: vedi commento in testa al file.
      }
    })();
  }, [router]);
}
