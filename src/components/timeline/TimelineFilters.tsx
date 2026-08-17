"use client";

import clsx from "clsx";

const TYPES = [
  { value: undefined, label: "Tutti" },
  { value: "text", label: "Testo" },
  { value: "audio", label: "Voce" },
  { value: "image", label: "Foto" },
  { value: "link", label: "Link" },
];

export function TimelineFilters({
  filters,
  onChange,
}: {
  filters: { type?: string; category?: string };
  onChange: (f: { type?: string; category?: string }) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
      {TYPES.map((t) => (
        <button
          key={t.label}
          onClick={() => onChange({ ...filters, type: t.value })}
          className={clsx(
            "px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-colors",
            filters.type === t.value ? "bg-primary text-white" : "bg-white/5 text-white/50"
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
