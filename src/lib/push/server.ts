import webpush from "web-push";
import { createServiceClient } from "@/lib/supabase/server";

const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT || "mailto:support@imrecall.app";

let configured = false;

function ensureConfigured() {
  if (configured) return true;
  if (!vapidPublicKey || !vapidPrivateKey) {
    console.warn("VAPID keys non configurate: notifica push saltata");
    return false;
  }
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  configured = true;
  return true;
}

/**
 * Invia una notifica push a tutti i dispositivi sottoscritti dall'utente.
 * Se una sottoscrizione risulta scaduta/revocata (404/410) viene rimossa.
 */
export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; url?: string }
) {
  if (!ensureConfigured()) return;

  const supabase = createServiceClient();
  const { data: subscriptions } = await supabase
    .from("push_subscriptions")
    .select("*")
    .eq("user_id", userId);

  if (!subscriptions || subscriptions.length === 0) return;

  const message = JSON.stringify(payload);

  await Promise.all(
    subscriptions.map(async (sub: any) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          message
        );
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        } else {
          console.error("Invio push fallito", err);
        }
      }
    })
  );
}
