"use client";

import { useState } from "react";
import { mutate } from "swr";

export function LinkCapture({ onSaved }: { onSaved: () => void }) {
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState<{
    title?: string;
    description?: string;
    image?: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleUrlBlur() {
    if (!url.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/extract/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (res.ok) setPreview(await res.json());
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setLoading(true);
    try {
      const res = await fetch("/api/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "link", link_url: url, ...preview }),
      });
      if (!res.ok) throw new Error("save_failed");
      mutate("/api/memories");
      onSaved();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="py-4 space-y-4">
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onBlur={handleUrlBlur}
        placeholder="Incolla un URL…"
        className="input-field"
        autoFocus
      />

      {preview && (
        <div className="card flex gap-3 items-center animate-fade-in">
          {preview.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview.image} alt="" className="w-14 h-14 rounded-lg object-cover" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{preview.title || url}</p>
            {preview.description && (
              <p className="text-xs text-white/50 line-clamp-2">{preview.description}</p>
            )}
          </div>
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={!url.trim() || loading}
        className="btn-primary w-full"
      >
        {loading ? "Salvataggio…" : "Salva link"}
      </button>
    </div>
  );
}
