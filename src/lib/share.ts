// Condivisione nativa dei contenuti di una riunione (riassunto, trascrizione,
// mappa mentale, registrazione audio) — richiesta dall'utente il 2026-09-17.
// Usa la Web Share API dove disponibile (apre il pannello nativo di
// condivisione del telefono/browser, funziona anche dentro la WebView
// dell'app Android); se non e' supportata copia il testo negli appunti come
// fallback, cosi' l'azione fa comunque qualcosa invece di fallire in silenzio.

export async function shareText(title: string, text: string) {
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ title, text });
      return;
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return; // utente ha annullato il pannello
    }
  }
  await copyToClipboard(text);
}

// L'audio va scaricato prima di poterlo allegare al pannello di condivisione
// (media_url e' un URL firmato Supabase Storage, non un file locale). Se il
// dispositivo non supporta la condivisione di file (navigator.canShare con
// files e' assente su molti browser desktop) si apre l'audio in una nuova
// scheda: da li' l'utente puo' comunque scaricarlo o condividerlo a mano.
export async function shareAudio(url: string, title: string) {
  const filename = `${sanitizeFilename(title)}.${extensionFromUrl(url)}`;
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const file = new File([blob], filename, { type: blob.type || "audio/mp4" });
    if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ title, files: [file] });
      return;
    }
  } catch (err) {
    if ((err as Error)?.name === "AbortError") return;
    console.error("Condivisione audio fallita, apro il file in una scheda", err);
  }
  if (typeof window !== "undefined") window.open(url, "_blank");
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    alert("Copiato negli appunti");
  } catch {
    alert("Condivisione non disponibile su questo dispositivo");
  }
}

function sanitizeFilename(name: string): string {
  const clean = (name || "registrazione").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return clean || "registrazione";
}

function extensionFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    const match = path.match(/\.([a-zA-Z0-9]+)(?:$|\?)/);
    return match ? match[1] : "m4a";
  } catch {
    return "m4a";
  }
}
