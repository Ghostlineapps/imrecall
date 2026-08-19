import { TodayCard } from "@/components/home/TodayCard";
import { MedicationsTodayCard } from "@/components/home/MedicationsTodayCard";
import { StreakBadge } from "@/components/home/StreakBadge";
import { NearbyForYou } from "@/components/home/NearbyForYou";
import { LocationStatusCard } from "@/components/home/LocationStatusCard";
import { DashboardSearchBar } from "@/components/home/DashboardSearchBar";
import { DashboardHub } from "@/components/home/DashboardHub";
import { createClient } from "@/lib/supabase/server";

// Prima si chiamava "Home" e non era chiaro a cosa servisse: ora è la
// Dashboard, il punto di partenza con accesso diretto (in cerchio) alle
// altre sezioni, una ricerca in cima, e sotto le stesse card di prima
// (oggi / nei paraggi / spostamenti) — nessuna funzione persa, solo
// raggiungibile in modo più diretto.
export default async function HomePage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, capture_streak_days")
    .eq("id", user?.id)
    .single();

  const firstName = profile?.full_name?.split(" ")[0] || "";

  return (
    <div className="bg-celeste-bg min-h-full px-5 pt-7 pb-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-celeste-muted text-sm font-medium">Ciao{firstName ? `, ${firstName}` : ""}</p>
          <h1 className="text-2xl font-extrabold text-celeste-navy">Dashboard</h1>
        </div>
        <StreakBadge days={profile?.capture_streak_days ?? 0} />
      </div>

      <DashboardSearchBar />

      <DashboardHub />

      <div className="space-y-4">
        {/* Un'unica card per oggi, non una dashboard con 5 sezioni scariche:
            meno scelta, più ritorno abituale. Il tipo di card ruota tra
            on_this_day / proximity / deadline / pre_trip in base a cosa ha
            priorità più alta oggi (vedi /api/insights/today). */}
        <TodayCard />

        {/* Dosi di oggi (se ci sono farmaci attivi) — non fa parte del
            resurfacing giornaliero sopra: si aggiorna in tempo reale e
            arriva anche via notifica push puntuale, vedi
            /api/cron/medications e BACKLOG.md. */}
        <MedicationsTodayCard />

        <NearbyForYou />

        {/* Punto d'ingresso per gli Spostamenti, non più dentro
            Impostazioni: resta l'unico punto d'ingresso da qui. */}
        <LocationStatusCard />
      </div>
    </div>
  );
}
