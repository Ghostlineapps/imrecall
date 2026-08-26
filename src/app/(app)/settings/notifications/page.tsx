"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// 2026-08-26: palette celeste (dodicesima schermata convertita).
export default function NotificationsSettingsPage() {
  const [supported, setSupported] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setSupported(false);
      return;
    }

    navigator.serviceWorker.getRegistration().then(async (reg) => {
      const sub = await reg?.pushManager.getSubscription();
      setEnabled(!!sub);
    });

    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? null));
  }, []);

  async function enablePush() {
    setError(null);
    setLoading(true);
    try {
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) {
        setError("Le notifiche push non sono ancora configurate su questo server.");
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setError("Permesso notifiche negato. Abilitalo nelle impostazioni del browser.");
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });

      setEnabled(true);
    } catch {
      setError("Attivazione notifiche fallita. Riprova.");
    } finally {
      setLoading(false);
    }
  }

  async function disablePush() {
    setLoading(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setEnabled(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-celeste-bg min-h-full px-4 pt-6 pb-4 space-y-6 text-celeste-navy">
      <div className="flex items-center gap-2">
        <Link href="/settings" className="text-celeste-muted text-sm">
          ← Impostazioni
        </Link>
      </div>

      <h1 className="text-xl font-semibold">Notifiche</h1>

      <div className="card-light space-y-3">
        <div>
          <p className="font-medium">Promemoria email</p>
          <p className="text-sm text-celeste-muted mt-1">
            {userEmail
              ? `Le email di promemoria per le scadenze arrivano automaticamente a ${userEmail}.`
              : "Le email di promemoria per le scadenze arrivano automaticamente al tuo indirizzo."}
          </p>
        </div>
      </div>

      <div className="card-light space-y-3">
        <div>
          <p className="font-medium">Notifiche push</p>
          <p className="text-sm text-celeste-muted mt-1">
            Ricevi un avviso push sul telefono o computer quando una scadenza si avvicina. Su
            iPhone funziona solo se aggiungi IMRECALL alla schermata Home (Safari → Condividi →
            Aggiungi a Home).
          </p>
        </div>

        {!supported && (
          <p className="text-urgent text-sm">Il tuo browser non supporta le notifiche push.</p>
        )}

        {supported && (
          <button
            onClick={enabled ? disablePush : enablePush}
            disabled={loading}
            className="btn-primary-light w-full"
          >
            {loading ? "Attendi…" : enabled ? "Disattiva notifiche push" : "Attiva notifiche push"}
          </button>
        )}

        {error && <p className="text-urgent text-sm">{error}</p>}
      </div>
    </div>
  );
}
