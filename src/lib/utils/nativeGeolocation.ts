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
    requestMicrophonePermission(): Promise<{ granted: boolean }>;
    getTrackingDebugState(): Promise<{ running: boolean; lastError: string | null; lastStartAt: number }>;
}

let cachedBridge: NativeBridgePlugin | null = null;

// Diagnostica temporanea (2026-09-01, round 2): dopo aver tolto la cache
// permanente del fallimento (vedi sotto), sul telefono di test
// getNativeDebugInfo() continua a mostrare "nativo:true plugin:true
// errore:-" mentre isNativeTrackingAvailable()/getNativeBridge() qui sotto
// continuano a comportarsi come se non fossero mai riusciti — pur essendo
// le due funzioni logicamente identiche (stesso import, stesso
// isNativePlatform, stesso registerPlugin). Finché non capiamo perché
// divergono, teniamo traccia dell'ultimo motivo di fallimento visto QUI
// (non in getNativeDebugInfo), per poterlo mostrare nella UI invece di
// continuare a indovinare alla cieca. Da rimuovere una volta trovata la causa.
let lastBridgeFailureReason: string | null = null;

export function getLastBridgeFailureReason(): string | null {
    return lastBridgeFailureReason;
}

// Caricato pigramente e solo su piattaforma nativa: su web @capacitor/core
// è comunque nel bundle (dipendenza condivisa), ma non c'è alcun plugin
// nativo "NativeBridge" registrato, quindi ogni chiamata fallirebbe — per
// questo ogni funzione sotto è avvolta in try/catch e degrada a no-op.
//
// BUG CORRETTO (2026-09-01): qui prima si metteva in cache una Promise
// creata al PRIMO utilizzo, memorizzando per sempre il suo risultato —
// compreso un eventuale "null" se Capacitor.isNativePlatform() risultava
// false in quel primo istante (es. una minima corsa all'avvio, più
// probabile caricando contenuto remoto via server.url invece di asset
// locali impacchettati). Una volta memorizzato "null", TUTTE le funzioni
// sotto (avvio tracciamento, permessi, diagnostica) restavano bloccate sul
// vecchio tracciamento da browser per l'intera sessione della pagina, anche
// se Capacitor diventava disponibile un istante dopo — combaciando esattamente
// coi sintomi osservati (nessuna notifica, nessun servizio avviato, "impossibile
// ottenere la posizione"), mentre un controllo diagnostico separato e non
// in cache (getNativeDebugInfo) risultava correttamente "nativo:true". Ora
// mettiamo in cache solo un successo: un fallimento non blocca i tentativi
// successivi.
async function getNativeBridge(): Promise<NativeBridgePlugin | null> {
    if (cachedBridge) return cachedBridge;

    try {
          const { Capacitor, registerPlugin } = await import("@capacitor/core");
          if (!Capacitor.isNativePlatform()) {
                  lastBridgeFailureReason = `isNativePlatform=false (platform=${Capacitor.getPlatform()})`;
                  return null;
          }
          const plugin = registerPlugin<NativeBridgePlugin>("NativeBridge");
          if (!plugin) {
                  lastBridgeFailureReason = "registerPlugin ha ritornato un valore vuoto";
                  return null;
          }
          cachedBridge = plugin;
          lastBridgeFailureReason = null;
          return plugin;
    } catch (err) {
          lastBridgeFailureReason =
                  "eccezione: " + (err instanceof Error ? `${err.name}: ${err.message}` : String(err));
          return null;
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

/**
 * Diagnostica temporanea (vedi TrackingDebugState.java lato nativo):
  * startNativeTracking() sopra ritorna successo appena Android accetta di
   * avviare il Foreground Service, non quando è davvero partito — se fallisce
    * dopo (es. un'eccezione dentro onStartCommand), il lato JS non lo scopre
     * mai da solo, ed è esattamente per questo che la notifica mancante è stata
      * così difficile da diagnosticare. Da rimuovere una volta trovata la causa.
       */
export async function getTrackingServiceDebugInfo(): Promise<{
    running: boolean;
    lastError: string | null;
    lastStartAt: number;
} | null> {
    const bridge = await getNativeBridge();
    if (!bridge) return null;

    try {
          return await bridge.getTrackingDebugState();
    } catch (err) {
          return { running: false, lastError: err instanceof Error ? err.message : String(err), lastStartAt: 0 };
    }
}

export async function getNativeDebugInfo(): Promise<{
    importOk: boolean;
    isNative: boolean | null;
    platform: string | null;
    pluginRegistered: boolean;
    error: string | null;
}> {
    try {
          const core = await import("@capacitor/core");
          const isNative = core.Capacitor.isNativePlatform();
          const platform = core.Capacitor.getPlatform();
          let pluginRegistered = false;
          let pluginError: string | null = null;
          try {
                  const plugin = core.registerPlugin<NativeBridgePlugin>("NativeBridge");
                  pluginRegistered = !!plugin;
          } catch (err) {
                  pluginError = err instanceof Error ? err.message : String(err);
          }
          return { importOk: true, isNative, platform, pluginRegistered, error: pluginError };
    } catch (err) {
          return {
                  importOk: false,
                  isNative: null,
                  platform: null,
                  pluginRegistered: false,
                  error: err instanceof Error ? err.message : String(err),
          };
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
    const bridge = await getNativeBridge();
    if (!bridge) return;

    try {
          await bridge.requestMicrophonePermission();
    } catch {
          // Se la richiesta fallisce, lasciamo che sia getUserMedia a fallire e
          // mostrare l'errore al chiamante, invece di bloccare tutto qui.
    }
}

