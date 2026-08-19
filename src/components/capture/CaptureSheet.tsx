"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import clsx from "clsx";
import { AudioRecorder } from "./AudioRecorder";
import { MeetingRecorder } from "./MeetingRecorder";
import { ImageCapture } from "./ImageCapture";
import { LinkCapture } from "./LinkCapture";
import { DocumentCapture } from "./DocumentCapture";

type Tab = "audio" | "meeting" | "image" | "link" | "document";

export function CaptureSheet({
  open,
  onClose,
  initialTab,
}: {
  open: boolean;
  onClose: () => void;
  initialTab: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);

  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-30 flex items-end">
      <div className="absolute inset-0 bg-black/60 animate-fade-in" onClick={onClose} />
      <div className="relative w-full bg-surface rounded-t-3xl p-5 pb-8 animate-fade-in max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-1 bg-white/5 rounded-full p-1 overflow-x-auto">
            {(["audio", "meeting", "image", "document", "link"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={clsx(
                  "px-4 py-1.5 rounded-full text-sm capitalize transition-colors whitespace-nowrap",
                  tab === t ? "bg-primary text-white" : "text-white/50"
                )}
              >
                {t === "audio"
                  ? "Voce"
                  : t === "meeting"
                    ? "Riunione"
                    : t === "image"
                      ? "Foto"
                      : t === "document"
                        ? "File"
                        : "Link"}
              </button>
            ))}
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white p-1">
            <X size={20} />
          </button>
        </div>

        {tab === "audio" && <AudioRecorder onSaved={onClose} />}
        {tab === "meeting" && <MeetingRecorder onSaved={onClose} />}
        {tab === "image" && <ImageCapture onSaved={onClose} />}
        {tab === "document" && <DocumentCapture onSaved={onClose} />}
        {tab === "link" && <LinkCapture onSaved={onClose} />}
      </div>
    </div>
  );
}
