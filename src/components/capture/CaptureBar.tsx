"use client";

import { useState } from "react";
import { Mic, Camera, Link2, FileUp, Send } from "lucide-react";
import { CaptureSheet } from "./CaptureSheet";
import { useCapture } from "@/hooks/useCapture";

export function CaptureBar() {
  const [text, setText] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetTab, setSheetTab] = useState<"audio" | "image" | "link" | "document">("audio");
  const { captureText, isSaving } = useCapture();

  async function handleSend() {
    if (!text.trim()) return;
    await captureText(text.trim());
    setText("");
  }

  function openSheet(tab: "audio" | "image" | "link" | "document") {
    setSheetTab(tab);
    setSheetOpen(true);
  }

  return (
    <>
      <div className="card flex items-center gap-2 shadow-lg shadow-black/40">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleSend();
          }}
          placeholder="Scrivi qualcosa da ricordare…"
          className="flex-1 bg-transparent outline-none placeholder:text-white/30 text-sm"
        />
        <button
          onClick={() => openSheet("audio")}
          aria-label="Registra audio"
          className="p-2 text-white/50 hover:text-white transition-colors"
        >
          <Mic size={18} />
        </button>
        <button
          onClick={() => openSheet("image")}
          aria-label="Aggiungi foto"
          className="p-2 text-white/50 hover:text-white transition-colors"
        >
          <Camera size={18} />
        </button>
        <button
          onClick={() => openSheet("document")}
          aria-label="Carica file"
          className="p-2 text-white/50 hover:text-white transition-colors"
        >
          <FileUp size={18} />
        </button>
        <button
          onClick={() => openSheet("link")}
          aria-label="Salva link"
          className="p-2 text-white/50 hover:text-white transition-colors"
        >
          <Link2 size={18} />
        </button>
        {text.trim() && (
          <button
            onClick={handleSend}
            disabled={isSaving}
            aria-label="Salva"
            className="p-2 bg-primary rounded-full text-white disabled:opacity-40"
          >
            <Send size={16} />
          </button>
        )}
      </div>

      <CaptureSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        initialTab={sheetTab}
      />
    </>
  );
}
