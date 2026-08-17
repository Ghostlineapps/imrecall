"use client";

import { Check, X } from "lucide-react";

export function IntentionActions({
  memoryId,
  status,
  onUpdate,
}: {
  memoryId: string;
  status: string;
  onUpdate: () => void;
}) {
  async function updateStatus(intention_status: "done" | "dismissed") {
    await fetch(`/api/memories/${memoryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intention_status }),
    });
    onUpdate();
  }

  if (status !== "pending") {
    return (
      <div className="card text-sm text-white/50">
        {status === "done" ? "✓ Segnata come fatta" : "Intenzione archiviata"}
      </div>
    );
  }

  return (
    <div className="card space-y-2">
      <p className="text-sm text-white/70">Questo era un desiderio aperto. Ci sei riuscito?</p>
      <div className="flex gap-2">
        <button
          onClick={() => updateStatus("done")}
          className="flex-1 flex items-center justify-center gap-1.5 bg-green-500/10 text-green-400 rounded-full py-2 text-sm"
        >
          <Check size={14} /> Fatto
        </button>
        <button
          onClick={() => updateStatus("dismissed")}
          className="flex-1 flex items-center justify-center gap-1.5 bg-white/5 text-white/50 rounded-full py-2 text-sm"
        >
          <X size={14} /> Non più interessato
        </button>
      </div>
    </div>
  );
}
