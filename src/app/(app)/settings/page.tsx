"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
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
    <div className="px-4 pt-6 space-y-6">
      <h1 className="text-xl font-semibold">Impostazioni</h1>

      <div className="card space-y-1">
        <p className="text-sm text-white/50">Piano attuale</p>
        <p className="font-medium capitalize">{data?.subscription_tier ?? "free"}</p>
        {data?.subscription_tier === "free" && (
          <p className="text-xs text-white/40 mt-1">
            {data?.memory_count_this_month ?? 0}/{data?.memory_limit_this_month ?? 100} memorie questo mese
          </p>
        )}
        <p className="text-xs text-white/40 mt-1">
          {data?.transcription_minutes_this_month ?? 0}/{data?.transcription_minutes_limit ?? 60} min di
          trascrizione questo mese (audio + riunioni)
        </p>
      </div>

      <Link href="/settings/profile" className="card block">
        <p className="font-medium">Il tuo profilo</p>
        <p className="text-xs text-white/40 mt-1">Alimentazione e interessi, per i consigli nei paraggi</p>
      </Link>

      {/* "Spostamenti" non è più qui: è una funzione (traccia e mostra dove
          sei stato), non una preferenza — vive in Dashboard, dove il suo
          valore si vede davvero. Qui restano solo vere impostazioni. */}

      <Link href="/settings/notifications" className="card block">
        <p className="font-medium">Notifiche</p>
        <p className="text-xs text-white/40 mt-1">Promemoria scadenze via email e push</p>
      </Link>

      <Link href="/settings/integrations" className="card block">
        <p className="font-medium">Integrazioni</p>
        <p className="text-xs text-white/40 mt-1">
          Collega Gmail per rilevare automaticamente appuntamenti dalle email
        </p>
      </Link>

      <button onClick={handleLogout} className="btn-ghost text-sm">
        Esci
      </button>
    </div>
  );
}
