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
            {data?.memory_count_this_month ?? 0}/100 memorie questo mese
          </p>
        )}
      </div>

      <Link href="/settings/location" className="card block">
        <p className="font-medium">Spostamenti</p>
        <p className="text-xs text-white/40 mt-1">Importa da Google Maps e tracciamento live</p>
      </Link>

      <button onClick={handleLogout} className="btn-ghost text-sm">
        Esci
      </button>
    </div>
  );
}
