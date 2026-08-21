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

// Saluto legato all'ora del giorno: un tocco piccolo ma che rende la
// Dashboard meno anonima, senza bisogno di contenuti dinamici pesanti da
// calcolare — vedi discussione redesign 2026-08-21 ("pagina troppo piatta,
// senza identità"). Pagina già dinamica (dipende dai cookie di sessione),
// quindi calcolare l'ora lato server ad ogni richiesta è sicuro.
function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "Ancora sveglio";
  if (hour < 12) return "Buongiorno";
  if (hour < 18) return "Buon pomeriggio";
  return "Buonasera";
}

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
    <div className="bg-celeste-bg min-h-full pb-8 space-y-6">
      {/* Hero: prima erano due righe di testo piatte su sfondo uniforme,
          "Ciao / Dashboard" — un'etichetta, non un benvenuto. Ora un blocco
          a piena larghezza con la palette del brand, il saluto vero e la
          promessa del prodotto, più due bagliori sfocati per dare
          profondità invece di un colore piatto. Il resto della pagina resta
          sulla stessa palette, solo meno "urlata". */}
      <div className="relative overflow-hidden bg-gradient-to-br from-celeste-accent to-celeste-accentDark px-5 pt-8 pb-9 rounded-b-[32px] shadow-lg shadow-celeste-navy/15">
        <div className="absolute -right-8 -top-16 w-44 h-44 rounded-full bg-white/10 blur-2xl pointer-events-none" />
        <div className="absolute -left-10 -bottom-12 w-32 h-32 rounded-full bg-white/10 blur-2xl pointer-events-none" />

        <div className="relative flex items-start justify-between gap-3">
          <div>
            <p className="text-white/70 text-xs font-semibold tracking-wide uppercase">IMRECALL</p>
            <h1 className="text-2xl font-extrabold text-white leading-tight mt-1">
              {greeting()}
              {firstName ? `, ${firstName}` : ""}
            </h1>
            <p className="text-white/75 text-sm mt-1.5">La tua memoria, sempre con te.</p>
          </div>
          <StreakBadge days={profile?.capture_streak_days ?? 0} />
        </div>

        <div className="relative mt-6">
          <DashboardSearchBar />
        </div>
      </div>

      <div className="px-5 space-y-8">
        <DashboardHub />

        <div className="space-y-4 text-celeste-navy">
          {/* Un'unica card per oggi, non una dashboard con 5 sezioni
              scariche: meno scelta, più ritorno abituale. Il tipo di card
              ruota tra on_this_day / proximity / deadline / pre_trip in
              base a cosa ha priorità più alta oggi (vedi
              /api/insights/today). */}
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
    </div>
  );
}
