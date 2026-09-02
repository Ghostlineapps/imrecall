// src/hooks/useCaptureQueueSync.ts
//
// Avvia il "motore" della coda offline una volta per sessione app: al
// montaggio carica lo stato salvato (registrazioni rimaste in coda da una
// sessione precedente, es. se l'app è stata chiusa mentre erano offline) e
// tenta subito di caricarle; poi ritenta ogni volta che il telefono torna
// online e, come rete di sicurezza, ogni 30 secondi mentre l'app è aperta
// (utile per reti "finte online" che in realtà non instradano traffico).

"use client";

import { useEffect } from "react";
import { useCaptureQueueStore } from "@/stores/captureQueueStore";

export function useCaptureQueueSync() {
  const hydrate = useCaptureQueueStore((s) => s.hydrate);
  const processQueue = useCaptureQueueStore((s) => s.processQueue);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await hydrate();
      if (!cancelled) processQueue();
    })();

    const onOnline = () => processQueue();
    window.addEventListener("online", onOnline);
    const interval = setInterval(() => processQueue(), 30000);

    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
      clearInterval(interval);
    };
  }, [hydrate, processQueue]);
}
