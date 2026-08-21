"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import clsx from "clsx";
import { TextCapture } from "./TextCapture";
import { AudioRecorder } from "./AudioRecorder";
import { MeetingRecorder } from "./MeetingRecorder";
import { ImageCapture } from "./ImageCapture";
import { LinkCapture } from "./LinkCapture";
import { DocumentCapture } from "./DocumentCapture";
import { MedicationCapture } from "./MedicationCapture";
import { ExpenseCapture } from "./ExpenseCapture";

type Tab = "text" | "audio" | "meeting" | "image" | "link" | "document" | "medication" | "expense";

const ALL_TABS: Tab[] = ["text", "audio", "meeting", "image", "document", "medication", "link"];

export function CaptureSheet({
  open,
  onClose,
  initialTab,
  allowedTabs,
  // Modalità "Salute" (vedi sezione Salute in Dashboard): le foto e i file
  // caricati da qui vengono marcati is_health=true, così compaiono nella
  // lista referti/esami — senza toccare in alcun modo etichette,
  // categorizzazione o ricerca generica (vedi migrazione 020).
  healthMode = false,
  // Modalità "Spese" (vedi sezione Spese in Dashboard, migrazione 022): le
  // foto caricate da qui vengono marcate is_expense=true e passano dalla
  // lettura automatica dello scontrino (vedi /api/upload/image).
  expenseMode = false,
}: {
  open: boolean;
  onClose: () => void;
  initialTab: Tab;
  allowedTabs?: Tab[];
  healthMode?: boolean;
  expenseMode?: boolean;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const tabs = allowedTabs ?? ALL_TABS;

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
            {tabs.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={clsx(
                  "px-4 py-1.5 rounded-full text-sm capitalize transition-colors whitespace-nowrap",
                  tab === t ? "bg-primary text-white" : "text-white/50"
                )}
              >
                {t === "text"
                  ? "Testo"
                  : t === "audio"
                    ? "Voce"
                    : t === "meeting"
                      ? "Riunione"
                      : t === "image"
                        ? "Foto"
                        : t === "document"
                          ? "File"
                          : t === "medication"
                            ? "Farmaco"
                            : t === "expense"
                              ? "Spesa"
                              : "Link"}
              </button>
            ))}
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white p-1">
            <X size={20} />
          </button>
        </div>

        {tab === "text" && <TextCapture onSaved={onClose} />}
        {tab === "audio" && <AudioRecorder onSaved={onClose} />}
        {tab === "meeting" && <MeetingRecorder onSaved={onClose} />}
        {tab === "image" && <ImageCapture onSaved={onClose} isHealth={healthMode} isExpense={expenseMode} />}
        {tab === "document" && <DocumentCapture onSaved={onClose} isHealth={healthMode} />}
        {tab === "medication" && <MedicationCapture onSaved={onClose} />}
        {tab === "expense" && <ExpenseCapture onSaved={onClose} />}
        {tab === "link" && <LinkCapture onSaved={onClose} />}
      </div>
    </div>
  );
}
