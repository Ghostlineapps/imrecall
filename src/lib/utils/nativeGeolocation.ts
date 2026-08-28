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
