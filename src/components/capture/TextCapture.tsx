"use client";

import { useState } from "react";
import { useCapture } from "@/hooks/useCapture";

export function TextCapture({ onSaved }: { onSaved: () => void }) {
  const [text, setText] = useState("");
  const { captureText, isSaving } = useCapture();

  async function handleSave() {
    if (!text.trim()) return;
    await captureText(text.trim());
    setText("");
    onSaved();
  }

  return (
    <div className="py-4 space-y-4">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleSave();
        }}
        placeholder="Scrivi qualcosa da ricordare…"
        rows={4}
        autoFocus
        className="input-field resize-none"
      />
      <button onClick={handleSave} disabled={!text.trim() || isSaving} className="btn-primary w-full">
        {isSaving ? "Salvataggio…" : "Salva"}
      </button>
    </div>
  );
}
