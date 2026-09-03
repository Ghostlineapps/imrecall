package app.imrecall.mobile.location;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Plugin Capacitor custom registrato come "NativeBridge" (deve combaciare
 * con la stringa usata da registerPlugin in nativeGeolocation.ts lato web):
 * fa da ponte tra la sessione Supabase gestita dal lato web e i componenti
 * nativi in background (LocationTrackingService, GeofenceSyncWorker,
 * CheckinWorker), che non hanno una WebView e quindi non possono leggere i
 * cookie/localStorage della pagina.
 */
@CapacitorPlugin(
    name = "NativeBridge",
    permissions = {
        @Permission(strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }, alias = "foregroundLocation"),
        @Permission(strings = { Manifest.permission.ACCESS_BACKGROUND_LOCATION }, alias = "backgroundLocation"),
        // Richiesto da Android 13+ (API 33) per poter mostrare QUALSIASI
        // notifica, inclusa quella persistente del Foreground Service —
        // senza questo permesso il servizio parte comunque (tracking e
        // geofencing funzionano) ma la notifica resta semplicemente
        // invisibile, cosa che rompe la garanzia di affidabilità/trasparenza
        // scelta per questa funzione.
        @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications"),
        // Serve alle registrazioni (nota vocale, riunione) che usano
        // navigator.mediaDevices.getUserMedia dentro la WebView: Capacitor
        // concede il microfono alla pagina web SOLO se l'app possiede già
        // questo permesso runtime — senza chiederlo esplicitamente prima,
        // getUserMedia fallisce sempre e in silenzio (la registrazione non
        // parte mai, senza nessun errore visibile).
        @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "microphone"),
    }
)
public class AuthBridgePlugin extends Plugin {

    /** Chiamato dopo login e a ogni refresh automatico della sessione (vedi useNativeSessionBridge). */
    @PluginMethod
    public void setSession(PluginCall call) {
        String accessToken = call.getString("accessToken");
        String refreshToken = call.getString("refreshToken");
        Double expiresAtNum = call.getDouble("expiresAt");
        String supabaseUrl = call.getString("supabaseUrl");
        String supabaseAnonKey = call.getString("supabaseAnonKey");

        if (accessToken == null || refreshToken == null || supabaseUrl == null || supabaseAnonKey == null) {
            call.reject("missing_session_fields");
            return;
        }

        long expiresAt = expiresAtNum != null ? expiresAtNum.longValue() : 0;
        NativeAuth.saveSession(getContext(), accessToken, refreshToken, expiresAt, supabaseUrl, supabaseAnonKey);
        call.resolve();
    }

    /** Chiamato al logout: ferma anche il tracking, non ha senso continuare senza un utente. */
    @PluginMethod
    public void clearSession(PluginCall call) {
        NativeAuth.clearSession(getContext());
        LocationTrackingService.stop(getContext());
        call.resolve();
    }

    /**
     * Richiede il permesso di posizione "sempre consentita". Su Android 10
     * e precedenti è già incluso in ACCESS_FINE_LOCATION; da Android 11 va
     * chiesto in un secondo passaggio separato, e solo dopo che il permesso
     * in foreground è già stato concesso (il sistema non permette di
     * chiederli insieme).
     */
    @PluginMethod
    public void requestBackgroundLocationPermission(PluginCall call) {
        if (!hasForegroundLocation()) {
            requestPermissionForAlias("foregroundLocation", call, "onForegroundLocationResult");
            return;
        }
        resolveBackgroundPermission(call);
    }

    @PermissionCallback
    private void onForegroundLocationResult(PluginCall call) {
        if (!hasForegroundLocation()) {
            JSObject ret = new JSObject();
            ret.put("granted", false);
            call.resolve(ret);
            return;
        }
        resolveBackgroundPermission(call);
    }

    private void resolveBackgroundPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || hasBackgroundLocation()) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }
        requestPermissionForAlias("backgroundLocation", call, "onBackgroundLocationResult");
    }

    @PermissionCallback
    private void onBackgroundLocationResult(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", hasBackgroundLocation());
        call.resolve(ret);
    }

    private boolean hasForegroundLocation() {
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION)
            == PackageManager.PERMISSION_GRANTED;
    }

    private boolean hasBackgroundLocation() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return true;
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_BACKGROUND_LOCATION)
            == PackageManager.PERMISSION_GRANTED;
    }

    @PluginMethod
    public void startTracking(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !hasNotificationPermission()) {
            requestPermissionForAlias("notifications", call, "onNotificationPermissionResult");
            return;
        }
        LocationTrackingService.start(getContext());
        call.resolve();
    }

    @PermissionCallback
    private void onNotificationPermissionResult(PluginCall call) {
        // Anche se l'utente nega il permesso notifiche, avviamo comunque il
        // servizio: tracking e geofencing restano funzionanti, semplicemente
        // senza la notifica persistente visibile.
        LocationTrackingService.start(getContext());
        call.resolve();
    }

    private boolean hasNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true;
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS)
            == PackageManager.PERMISSION_GRANTED;
    }

    @PluginMethod
    public void stopTracking(PluginCall call) {
        LocationTrackingService.stop(getContext());
        call.resolve();
    }

    /**
     * Diagnostica temporanea (vedi TrackingDebugState.java): startTracking()
     * sopra ritorna successo appena il sistema ACCETTA di avviare il
     * servizio, non quando il servizio è davvero partito — se
     * onStartCommand lancia un'eccezione dopo, il lato JS non lo scopre mai
     * da solo. Questo metodo legge lo stato vero registrato dal servizio
     * stesso, per vedere finalmente perché la notifica non compare.
     */
    @PluginMethod
    public void getTrackingDebugState(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("running", TrackingDebugState.isRunning(getContext()));
        ret.put("lastError", TrackingDebugState.getLastError(getContext()));
        ret.put("lastStartAt", TrackingDebugState.getLastStartAt(getContext()));
        call.resolve(ret);
    }

    /**
     * Chiesto dal lato web prima di ogni registrazione audio (nota vocale o
     * riunione), vedi ensureNativeMicrophonePermission() in
     * nativeGeolocation.ts. Una volta concesso, la WebView può usare
     * getUserMedia({ audio: true }) normalmente.
     */
    @PluginMethod
    public void requestMicrophonePermission(PluginCall call) {
        if (hasMicrophonePermission()) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }
        requestPermissionForAlias("microphone", call, "onMicrophonePermissionResult");
    }

    @PermissionCallback
    private void onMicrophonePermissionResult(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", hasMicrophonePermission());
        call.resolve(ret);
    }

    private boolean hasMicrophonePermission() {
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO)
            == PackageManager.PERMISSION_GRANTED;
    }
}
