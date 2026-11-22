import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe/client";

// Cancellazione account self-service — richiesta 2026-11-22: oggi si
// gestisce solo a mano via email (info@axistpl.hk), che con traffico
// pubblico reale non è sostenibile ed è anche uno dei campi obbligatori
// del form Data Safety di Google Play ("gli utenti possono chiedere la
// cancellazione dei dati?" va bene rispondere sì solo se esiste davvero un
// percorso, non solo un indirizzo email a cui scrivere).
//
// L'eliminazione vera e propria è un solo passaggio: auth.admin.deleteUser
// cancella la riga in auth.users, e "profiles.id references auth.users(id)
// on delete cascade" (migrazione 002) si porta dietro a cascata TUTTE le
// tabelle utente (memorie, farmaci, luoghi, integrazioni, ecc. — ogni
// tabella in supabase/migrations/*.sql referenzia profiles con "on delete
// cascade"). Prima di quel passaggio servono due pulizie che il database da
// solo non farebbe mai:
// 1. Disdire un eventuale abbonamento Stripe attivo — cancellare la riga
//    locale non ferma la fatturazione ricorrente lato Stripe, lascerebbe
//    un cliente a pagare un account che non esiste più.
// 2. Rimuovere i file nello Storage (bucket images/audio/documents): non
//    sono righe Postgres, quindi il cascade della foreign key non li tocca.
export const dynamic = "force-dynamic";

const STORAGE_BUCKETS = ["images", "audio", "documents"] as const;

export async function DELETE() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createServiceClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_subscription_id")
    .eq("id", user.id)
    .single();

  // Se la cancellazione su Stripe fallisce (es. già cancellato, o un
  // problema transitorio con l'API Stripe) non blocchiamo comunque la
  // cancellazione dell'account: l'utente ha chiesto esplicitamente di
  // cancellarsi, e un abbonamento rimasto attivo per errore lato Stripe è
  // comunque risolvibile a mano in seguito — un account che l'utente non
  // riesce a cancellare per un problema di billing sarebbe peggio.
  if (profile?.stripe_subscription_id) {
    try {
      await stripe.subscriptions.cancel(profile.stripe_subscription_id);
    } catch (err) {
      console.error("Cancellazione abbonamento Stripe fallita durante eliminazione account:", err);
    }
  }

  // Storage: i bucket sono organizzati come "<user_id>/<file>" (stessa
  // convenzione in tutte le route di upload, vedi src/lib/uploadCapture.ts
  // e src/app/api/upload/*). list() sulla "cartella" user.id restituisce
  // solo i file diretti dentro, che è esattamente la struttura usata: mai
  // sottocartelle ulteriori.
  for (const bucket of STORAGE_BUCKETS) {
    const { data: files } = await admin.storage.from(bucket).list(user.id);
    if (files && files.length > 0) {
      const paths = files.map((f) => `${user.id}/${f.name}`);
      const { error: removeError } = await admin.storage.from(bucket).remove(paths);
      if (removeError) {
        console.error(`Rimozione file da bucket "${bucket}" fallita durante eliminazione account:`, removeError);
      }
    }
  }

  // Cancella auth.users: profiles e tutte le tabelle figlie (on delete
  // cascade, vedi commento sopra) spariscono con questa unica chiamata.
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error("Eliminazione account fallita:", deleteError);
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
