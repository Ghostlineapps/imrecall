import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <div className="max-w-md space-y-6 animate-fade-in">
        <h1 className="text-4xl font-semibold tracking-tight">
          IMRECALL
        </h1>
        <p className="text-white/60 text-lg leading-relaxed">
          Sei stato a Siviglia dieci anni fa e volevi provare quel ristorante.
          Non ci sei mai andato. Torni a Siviglia — <span className="text-white">te lo ricordiamo noi.</span>
        </p>
        <div className="flex gap-3 justify-center pt-4">
          <Link href="/signup" className="btn-primary">
            Inizia gratis
          </Link>
          <Link href="/login" className="btn-ghost px-5 py-2.5">
            Accedi
          </Link>
        </div>
      </div>
    </main>
  );
}
