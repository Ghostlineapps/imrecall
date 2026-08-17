"use client";

import { useState } from "react";
import { mutate } from "swr";

/**
 * Cattura una memoria testuale con feedback istantaneo: la memoria appare
 * subito in lista con stato "processing", la classificazione AI avviene
 * in background lato server (vedi /api/memories route.ts).
 */
export function useCapture() {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function captureText(content: string) {
    setIsSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "text", content }),
      });

      if (!res.ok) throw new Error("save_failed");

      // Rinfresca la lista memorie e il "today card" della home
      mutate("/api/memories");
      mutate("/api/insights/today");
    } catch {
      setError("Non sono riuscito a salvare. Riprova.");
    } finally {
      setIsSaving(false);
    }
  }

  return { captureText, isSaving, error };
}
