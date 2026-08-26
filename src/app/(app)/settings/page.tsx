"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import { ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function SettingsPage() {
  const router = useRouter();
  const { data } = useSWR("/api/user/usage", fetcher);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    // Palette celeste (redesign 2026-08-21/26, quinta schermata convertita):
    // stessa struttura di prima, solo colori. Le sotto-pagine (profilo,
    // notifiche, integrazioni, spostamenti) restano sul tema scuro per ora.
    <div className="bg-celeste-bg min-h-full px-4 pt-6 pb-4 space-y-6 text-celeste-navy">
      <h1 className="text-xl font-semibold">Impostazioni</h1>

      <Link href="/settings/premium" className="card-light space-y-1 block">
        <div className="flex items-center justify-between">
          <p className="text-sm text-celeste-muted">Piano attuale</p>
          <ChevronRight size={16} className="text-celeste-navy/25" />
        </div>
        <p className="font-medium capitalize">{data?.subscription_tier ?? "free"}</p>
        {data?.subscription_tier === "free" && (
          <p className="text-xs text-celeste-muted mt-1">
            {data?.memory_count_this_month ?? 0}/{data?.memory_limit_this_month ?? 100} memorie questo mese
          </p>
        )}
        <p className="text-xs text-celeste-muted mt-1">
          {data?.transcription_minutes_this_month ?? 0}/{data?.transcription_minutes_limit ?? 60} min di
          trascrizione questo mese (audio + riunioni)
        </p>
        {data?.subscription_tier === "free" && (
          <p className="text-xs text-celeste-accentDark font-medium mt-1">Scopri Premium →</p>
        )}
      </Link>

      <Link href="/settings/profile" className="card-light block">
        <p className="font-medium">Il tuo profilo</p>
        <p className="text-xs text-celeste-muted mt-1">Alimentazione e interessi, per i consigli nei paraggi</p>
      </Link>

      {/* "Spostamenti" non è più qui: è una funzione (traccia e mostra dove
          sei stato), non una preferenza — vive in Dashboard, dove il suo
          valore si vede davvero. Qui restano solo vere impostazioni. */}

      <Link href="/settings/notifications" className="card-light block">
        <p className="font-medium">Notifiche</p>
        <p className="text-xs text-celeste-muted mt-1">Promemoria scadenze via email e push</p>
      </Link>

      <Link href="/settings/integrations" className="card-light block">
        <p className="font-medium">Integrazioni</p>
        <p className="text-xs text-celeste-muted mt-1">
          Collega Gmail per rilevare automaticamente appuntamenti dalle email
        </p>
      </Link>

      <button onClick={handleLogout} className="btn-ghost-light text-sm">
        Esci
      </button>
    </div>
  );
}
