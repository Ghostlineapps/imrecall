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
    const core = await import("@capacitor/core");
    if (!core.Capacitor.isNativePlatform()) return;

    const geoModule = await import("@capacitor/geolocation");
    await geoModule.Geolocation.requestPermissions();
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
//
// 2026-09-01: dopo una lunga sessione di debug (8 round, vedi cronologia
// commit) e' emerso che sul dispositivo di test una funzione che "aspetta"
// il risultato di un'altra funzione (anche solo isNativeTrackingAvailable()
// che chiama await getNativeBridge()) non si risolve MAI, mentre la stessa
// identica logica scritta dentro un'unica funzione funziona sempre — anche
// scrivendo la seconda funzione con .then() invece di async/await. Per
// questo ogni funzione qui sotto risolve il plugin per conto proprio,
// invece di delegare a un helper condiviso: un po' di codice ripetuto, ma
// dimostrato affidabile sul dispositivo di test. Se in futuro si vuole
// ridurre la duplicazione con un helper condiviso, testarlo con cura su un
// dispositivo Android reale prima di tornare a quello schema.

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
  requestMicrophonePermission(): Promise<{ granted: boolean }>;
  getTrackingDebugState(): Promise<{ running: boolean; lastError: string | null; lastStartAt: number }>;
}

/** true solo dentro l'app nativa Android (non su web/PWA). */
export async function isNativeTrackingAvailable(): Promise<boolean> {
  try {
    const core = await import("@capacitor/core");
    if (!core.Capacitor.isNativePlatform()) return false;
    const plugin = core.registerPlugin<NativeBridgePlugin>("NativeBridge");
    return !!plugin;
  } catch {
    return false;
  }
}

/**
 * Da chiamare dopo login e dopo ogni refresh automatico della sessione
 * Supabase (vedi useNativeSessionBridge): passa access/refresh token al
 * lato nativo, che li salva in EncryptedSharedPreferences per poter
 * autenticare le chiamate API del servizio di tracking/geofencing in
 * background, quando la WebView non è attiva. session === null pulisce i
 * token salvati (es. al logout).
 *
 * Passiamo anche URL Supabase e anon key: sono valori pubblici (già dentro
 * il bundle web, esposti al browser tramite NEXT_PUBLIC_*), ma il lato
 * nativo non ha altrimenti modo di conoscerli per rinnovare da solo il
 * token quando scade, dato che non legge il bundle JS.
 */
export async function pushSupabaseSession(
  session: { access_token: string; refresh_token: string; expires_at?: number } | null
): Promise<void> {
  let bridge: NativeBridgePlugin | null = null;
  try {
    const core = await import("@capacitor/core");
    if (!core.Capacitor.isNativePlatform()) return;
    bridge = core.registerPlugin<NativeBridgePlugin>("NativeBridge");
  } catch {
    return;
  }
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
  let bridge: NativeBridgePlugin | null = null;
  try {
    const core = await import("@capacitor/core");
    if (!core.Capacitor.isNativePlatform()) return true;
    bridge = core.registerPlugin<NativeBridgePlugin>("NativeBridge");
  } catch {
    return false;
  }
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
  let bridge: NativeBridgePlugin | null = null;
  try {
    const core = await import("@capacitor/core");
    if (!core.Capacitor.isNativePlatform()) return false;
    bridge = core.registerPlugin<NativeBridgePlugin>("NativeBridge");
  } catch {
    return false;
  }
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
  let bridge: NativeBridgePlugin | null = null;
  try {
    const core = await import("@capacitor/core");
    if (!core.Capacitor.isNativePlatform()) return;
    bridge = core.registerPlugin<NativeBridgePlugin>("NativeBridge");
  } catch {
    return;
  }
  if (!bridge) return;

  try {
    await bridge.stopTracking();
  } catch {
    // ignorabile: se il service non era attivo non c'è nulla da fermare
  }
}

/**
 * Stato del Foreground Service nativo (vedi TrackingDebugState.java lato
 * nativo): startNativeTracking() sopra ritorna successo appena Android
 * accetta di avviare il service, non quando è davvero partito — se
 * fallisce dopo (es. un'eccezione dentro onStartCommand), il lato JS non
 * lo scopre mai da solo senza questa chiamata esplicita.
 */
export async function getTrackingServiceDebugInfo(): Promise<{
  running: boolean;
  lastError: string | null;
  lastStartAt: number;
} | null> {
  let bridge: NativeBridgePlugin | null = null;
  try {
    const core = await import("@capacitor/core");
    if (!core.Capacitor.isNativePlatform()) return null;
    bridge = core.registerPlugin<NativeBridgePlugin>("NativeBridge");
  } catch {
    return null;
  }
  if (!bridge) return null;

  try {
    return await bridge.getTrackingDebugState();
  } catch (err) {
    return { running: false, lastError: err instanceof Error ? err.message : String(err), lastStartAt: 0 };
  }
}

/**
 * Da chiamare prima di ogni navigator.mediaDevices.getUserMedia({ audio })
 * (nota vocale, registrazione riunione): dentro l'app nativa Android,
 * Capacitor concede il microfono alla WebView SOLO se l'app possiede già il
 * permesso runtime RECORD_AUDIO — senza chiederlo esplicitamente qui prima,
 * getUserMedia fallisce sempre e in silenzio (il tocco su "Registra" non
 * sembra fare nulla). Su web/PWA non fa nulla: lì il browser gestisce da
 * solo il popup di permesso microfono al primo utilizzo.
 */
export async function ensureNativeMicrophonePermission(): Promise<void> {
  let bridge: NativeBridgePlugin | null = null;
  try {
    const core = await import("@capacitor/core");
    if (!core.Capacitor.isNativePlatform()) return;
    bridge = core.registerPlugin<NativeBridgePlugin>("NativeBridge");
  } catch {
    return;
  }
  if (!bridge) return;

  try {
    await bridge.requestMicrophonePermission();
  } catch {
    // Se la richiesta fallisce, lasciamo che sia getUserMedia a fallire e
    // mostrare l'errore al chiamante, invece di bloccare tutto qui.
  }
}
