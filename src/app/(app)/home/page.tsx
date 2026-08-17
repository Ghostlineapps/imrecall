import { TodayCard } from "@/components/home/TodayCard";
import { StreakBadge } from "@/components/home/StreakBadge";
import { RecentMemories } from "@/components/home/RecentMemories";
import { createClient } from "@/lib/supabase/server";

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
    <div className="px-4 pt-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-white/40 text-sm">Ciao{firstName ? `, ${firstName}` : ""}</p>
          <h1 className="text-xl font-semibold">La tua memoria oggi</h1>
        </div>
        <StreakBadge days={profile?.capture_streak_days ?? 0} />
      </div>

      {/* Un'unica card per oggi, non una dashboard con 5 sezioni scariche:
          meno scelta, più ritorno abituale. Il tipo di card ruota tra
          on_this_day / proximity / deadline / pre_trip in base a cosa ha
          priorità più alta oggi (vedi /api/insights/today). */}
      <TodayCard />

      <RecentMemories />
    </div>
  );
}
