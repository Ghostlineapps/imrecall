// Quando IMRECALL gira dentro il guscio nativo Android (Capacitor, vedi
// discussione 2026-08-28), chiamare direttamente navigator.geolocation NON
// basta a far comparire il vero permesso di sistema di Android: la webview
// di Capacitor decide se concedere l'accesso guardando solo se il permesso
// runtime (ACCESS_FINE_LOCATION) è GIÀ stato concesso, senza mai chiederlo
// da sola — risultato, la richiesta veniva sempre rifiutata in silenzio
// ("Permesso di geolocalizzazione negato"), anche al primissimo utilizzo.
// Il plugin ufficiale @capacitor/geolocation, invece, sa davvero innescare
// il dialog nativo di Android tramite la sua Geolocation.requestPermissions().
// Va chiamata una volta prima di qualunque navigator.geolocation, solo
// quando siamo dentro l'app nativa (su web/PWA questo modulo non fa nulla
// e le pagine continuano a usare navigator.geolocation come sempre).
let requested = false;

export async function ensureNativeLocationPermission(): Promise<void> {
  if (requested) return;
  requested = true;

  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return;

    const { Geolocation } = await import("@capacitor/geolocation");
    await Geolocation.requestPermissions();
  } catch {
    // Se il modulo non è disponibile (build web, non nativa) o la richiesta
    // fallisce, non blocchiamo nulla: le chiamate a navigator.geolocation
    // che seguono gestiscono già da sole il caso "permesso negato".
  }
}


// --- Ponte verso il plugin nativo "NativeBridge" (geofencing + tracking) ---
//
// @capacitor/geolocation gestisce solo il permesso di posizione in
// foreground. Il geofencing e il tracking adattivo in background (vedi
// piano tecnico) girano in un Foreground Service Android con notifica
// persistente, gestito da un plugin Capacitor custom registrato in
// MainActivity.java. Questo modulo espone quel plugin al resto del codice
// web con le stesse garanzie di nativeGeolocation: su web/PWA (non nativo)
// tutte le funzioni sono no-op sicuri.

interface NativeBridgePlugin {
  setSession(options: {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  supabaseUrl: string;
  supabaseAnonKey: string;
  }): Promise<void>;
  clearSession(): Promise<void>;
  requestBackgroundLocationPermission(): Promise<{ granted: boolean }>;
  startTracking(): Promise<void>;
  stopTracking(): Promise<void>;
}

let nativeBridgePromise: Promise<NativeBridgePlugin | null> | null = null;

// Caricato pigramente e solo su piattaforma nativa: su web @capacitor/core
// è comunque nel bundle (dipendenza condivisa), ma non c'è alcun plugin
// nativo "NativeBridge" registrato, quindi ogni chiamata fallirebbe — per
// questo ogni funzione sotto è avvolta in try/catch e degrada a no-op.
async function getNativeBridge(): Promise<NativeBridgePlugin | null> {
  if (!nativeBridgePromise) {
    nativeBridgePromise = (async () => {
      try {
        const { Capacitor, registerPlugin } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform()) return null;
        return registerPlugin<NativeBridgePlugin>("NativeBridge");
      } catch {
        return null;
      }
    })();
  }
  return nativeBridgePromise;
}

/**
* Da chiamare dopo login e dopo ogni refresh automatico della sessione
* Supabase (vedi useNativeSessionBridge): passa access/refresh token al
* lato nativo, che li salva in EncryptedSharedPreferences per poter
* autenticare le chiamate API del servizio di tracking/geofencing in
* background, quando la WebView non è attiva. session === null pulisce i
* token salvati (es. al logout).
*/
export async function pushSupabaseSession(
  session: { access_token: string; refresh_token: string; expires_at?: number } | null
  ): Promise<void> {
  const bridge = await getNativeBridge();
  if (!bridge) return;

try {
  if (!session) {
    await bridge.clearSession();
    return;
  }
  await bridge.setSession({
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at ?? 0,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  });
} catch {
  // Non bloccante: se il salvataggio fallisce, il tracking nativo resta
  // semplicemente inattivo finché non arriva un aggiornamento successivo.
}
}

/** Richiede il permesso "posizione sempre consentita" (Android 10+, va
* chiesto separatamente dal permesso in foreground). Su web ritorna true:
* non serve, il tracking lì resta comunque limitato al tab in foreground. */
export async function requestBackgroundLocationPermission(): Promise<boolean> {
  const bridge = await getNativeBridge();
  if (!bridge) return true;

try {
  const { granted } = await bridge.requestBackgroundLocationPermission();
  return granted;
} catch {
  return false;
}
}

/** Avvia il Foreground Service nativo (notifica persistente, tracking
* adattivo + geofencing). Ritorna false su web/PWA: lì il chiamante deve
* ricadere sul vecchio tracciamento a intervallo nel tab. */
export async function startNativeTracking(): Promise<boolean> {
  const bridge = await getNativeBridge();
  if (!bridge) return false;

try {
  await bridge.startTracking();
  return true;
} catch {
  return false;
}
}

/** Ferma il Foreground Service nativo, se attivo. No-op su web/PWA. */
export async function stopNativeTracking(): Promise<void> {
  const bridge = await getNativeBridge();
  if (!bridge) return;

try {
  await bridge.stopTracking();
} catch {
  // ignorabile: se il service non era attivo non c'è nulla da fermare
}
}

/** true solo dentro l'app nativa Android (non su web/PWA). */
export async function isNativeTrackingAvailable(): Promise<boolean> {
  return (await getNativeBridge()) !== null;
}
