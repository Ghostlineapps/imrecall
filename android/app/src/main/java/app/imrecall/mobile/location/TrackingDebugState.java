package app.imrecall.mobile.location;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * Stato di debug del Foreground Service, leggibile dal lato web tramite
 * AuthBridgePlugin.getTrackingDebugState(). Prima d'ora non c'era modo di
 * distinguere, dal lato JS, tra "il servizio non è mai stato avviato",
 * "è stato avviato ma è fallito internamente" (es. un'eccezione dentro
 * onStartCommand, che non arriva mai al chiamante JS perché
 * startForegroundService() è asincrono) e "sta girando correttamente" — il
 * che ha reso la diagnosi della notifica mancante molto più lenta del
 * necessario. Da rimuovere una volta trovata la causa.
 */
public class TrackingDebugState {
    private static final String PREFS = "imrecall_tracking_debug";
    private static final String KEY_RUNNING = "running";
    private static final String KEY_LAST_ERROR = "last_error";
    private static final String KEY_LAST_START_AT = "last_start_at";

    public static void markStarting(Context context) {
        prefs(context).edit()
            .putBoolean(KEY_RUNNING, false)
            .putString(KEY_LAST_ERROR, null)
            .putLong(KEY_LAST_START_AT, System.currentTimeMillis())
            .apply();
    }

    public static void markRunning(Context context) {
        prefs(context).edit().putBoolean(KEY_RUNNING, true).apply();
    }

    public static void markError(Context context, String message) {
        prefs(context).edit()
            .putBoolean(KEY_RUNNING, false)
            .putString(KEY_LAST_ERROR, message)
            .apply();
    }

    public static void markStopped(Context context) {
        prefs(context).edit().putBoolean(KEY_RUNNING, false).apply();
    }

    public static boolean isRunning(Context context) {
        return prefs(context).getBoolean(KEY_RUNNING, false);
    }

    public static String getLastError(Context context) {
        return prefs(context).getString(KEY_LAST_ERROR, null);
    }

    public static long getLastStartAt(Context context) {
        return prefs(context).getLong(KEY_LAST_START_AT, 0);
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
