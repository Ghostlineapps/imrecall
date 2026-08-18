"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import clsx from "clsx";
import { DIETARY_OPTIONS, INTEREST_OPTIONS } from "@/lib/constants/preferences";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// Toggle a chip singolo con salvataggio immediato (niente form/tasto Salva):
// scegliere "vegano" deve avere effetto subito sui consigli nei paraggi in
// Home, senza un passaggio in più da ricordarsi di fare.
export default function ProfilePreferencesPage() {
  const { data, isLoading } = useSWR("/api/profile", fetcher);

  const [diet, setDiet] = useState<string[]>([]);
  const [interests, setInterests] = useState<string[]>([]);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setDiet(data.dietary_preferences ?? []);
      setInterests(data.interests ?? []);
    }
  }, [data]);

  async function toggle(kind: "dietary_preferences" | "interests", value: string) {
    const current = kind === "dietary_preferences" ? diet : interests;
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];

    if (kind === "dietary_preferences") setDiet(next);
    else setInterests(next);

    setSaving(value);
    try {
      await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [kind]: next }),
      });
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="px-4 pt-6 space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/settings" className="text-white/50 text-sm">
          ← Impostazioni
        </Link>
      </div>

      <div>
        <h1 className="text-xl font-semibold">Il tuo profilo</h1>
        <p className="text-sm text-white/50 mt-1">
          Usiamo queste preferenze per segnalarti i posti giusti quando arrivi in un posto nuovo —
          ad esempio i ristoranti vegani vicino a te, invece di una lista generica.
        </p>
      </div>

      <div className="card space-y-3">
        <p className="font-medium">Alimentazione</p>
        <div className="flex flex-wrap gap-2">
          {DIETARY_OPTIONS.map((opt) => {
            const active = diet.includes(opt.value);
            return (
              <button
                key={opt.value}
                onClick={() => toggle("dietary_preferences", opt.value)}
                disabled={saving === opt.value}
                className={clsx(
                  "px-3 py-1.5 rounded-full text-sm border transition-colors",
                  active
                    ? "bg-primary border-primary text-white"
                    : "border-white/15 text-white/60 hover:border-white/30"
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="card space-y-3">
        <p className="font-medium">Interessi</p>
        <div className="flex flex-wrap gap-2">
          {INTEREST_OPTIONS.map((opt) => {
            const active = interests.includes(opt.value);
            return (
              <button
                key={opt.value}
                onClick={() => toggle("interests", opt.value)}
                disabled={saving === opt.value}
                className={clsx(
                  "px-3 py-1.5 rounded-full text-sm border transition-colors",
                  active
                    ? "bg-primary border-primary text-white"
                    : "border-white/15 text-white/60 hover:border-white/30"
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {!isLoading && diet.length === 0 && interests.length === 0 && (
        <p className="text-white/30 text-xs px-1">
          Non hai ancora selezionato nulla: per ora i consigli nei paraggi saranno generici.
        </p>
      )}
    </div>
  );
}
