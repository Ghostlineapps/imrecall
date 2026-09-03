package app.imrecall.mobile.location;

import android.content.Context;
import android.content.SharedPreferences;
import androidx.annotation.Nullable;
import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/**
 * Sessione Supabase (access/refresh token + URL/anon key del progetto) e
 * rinnovo del token, condivisi da AuthBridgePlugin (che riceve la sessione
 * dal lato web dopo login) e dai componenti in background — LocationTrackingService,
 * GeofenceSyncWorker, CheckinWorker — che non hanno una WebView/cookie e
 * quindi devono autenticare le chiamate API con un bearer token (vedi
 * getAuthenticatedUser lato web in lib/supabase/server.ts).
 *
 * I token sono salvati in EncryptedSharedPreferences: sono credenziali vere
 * (danno accesso all'account Supabase dell'utente), a differenza degli altri
 * dati nativi (place cache, flag di tracking) che restano in prefs normali.
 */
public class NativeAuth {
    private static final String PREFS_NAME = "imrecall_native_auth";
    private static final String KEY_ACCESS_TOKEN = "access_token";
    private static final String KEY_REFRESH_TOKEN = "refresh_token";
    private static final String KEY_EXPIRES_AT = "expires_at";
    private static final String KEY_SUPABASE_URL = "supabase_url";
    private static final String KEY_SUPABASE_ANON_KEY = "supabase_anon_key";

    // Deve combaciare con "server.url" in capacitor.config.ts: è l'origine
    // da cui girano le API che il resto dell'app chiama con path relativi.
    public static final String APP_BASE_URL = "https://www.imrecall.app";

    private NativeAuth() {}

    private static SharedPreferences prefs(Context context) throws Exception {
        MasterKey masterKey = new MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build();
        return EncryptedSharedPreferences.create(
            context,
            PREFS_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        );
    }

    public static void saveSession(
        Context context,
        String accessToken,
        String refreshToken,
        long expiresAt,
        String supabaseUrl,
        String supabaseAnonKey
    ) {
        try {
            prefs(context)
                .edit()
                .putString(KEY_ACCESS_TOKEN, accessToken)
                .putString(KEY_REFRESH_TOKEN, refreshToken)
                .putLong(KEY_EXPIRES_AT, expiresAt)
                .putString(KEY_SUPABASE_URL, supabaseUrl)
                .putString(KEY_SUPABASE_ANON_KEY, supabaseAnonKey)
                .apply();
        } catch (Exception e) {
            // Se la crittografia fallisce (raro), il lato nativo resta senza
            // sessione finché non arriva un nuovo setSession dal lato web.
        }
    }

    public static void clearSession(Context context) {
        try {
            prefs(context).edit().clear().apply();
        } catch (Exception ignored) {
        }
    }

    public static boolean hasSession(Context context) {
        try {
            String refreshToken = prefs(context).getString(KEY_REFRESH_TOKEN, null);
            return refreshToken != null;
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Ritorna un access token valido (rinnovandolo se scaduto tramite
     * l'endpoint Supabase di refresh), oppure null se non c'è nessuna
     * sessione salvata o il rinnovo fallisce — in quel caso il chiamante
     * deve semplicemente saltare la chiamata API, non c'è nulla da fare
     * finché l'utente non riapre l'app e la sessione viene reinviata.
     */
    @Nullable
    public static String getValidAccessToken(Context context) {
        try {
            SharedPreferences p = prefs(context);
            String refreshToken = p.getString(KEY_REFRESH_TOKEN, null);
            if (refreshToken == null) return null;

            String accessToken = p.getString(KEY_ACCESS_TOKEN, null);
            long expiresAt = p.getLong(KEY_EXPIRES_AT, 0);
            long nowSeconds = System.currentTimeMillis() / 1000;

            // Margine di 60s per non rischiare di usare un token che scade
            // proprio mentre la richiesta è in volo.
            if (accessToken != null && expiresAt > nowSeconds + 60) {
                return accessToken;
            }

            String supabaseUrl = p.getString(KEY_SUPABASE_URL, null);
            String supabaseAnonKey = p.getString(KEY_SUPABASE_ANON_KEY, null);
            if (supabaseUrl == null || supabaseAnonKey == null) return accessToken;

            return refreshAccessToken(context, supabaseUrl, supabaseAnonKey, refreshToken);
        } catch (Exception e) {
            return null;
        }
    }

    private static String refreshAccessToken(
        Context context,
        String supabaseUrl,
        String supabaseAnonKey,
        String refreshToken
    ) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(supabaseUrl + "/auth/v1/token?grant_type=refresh_token");
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("apikey", supabaseAnonKey);
            conn.setDoOutput(true);
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(15000);

            JSONObject body = new JSONObject();
            body.put("refresh_token", refreshToken);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }

            int code = conn.getResponseCode();
            if (code < 200 || code >= 300) return null;

            JSONObject json = new JSONObject(readStream(conn.getInputStream()));
            String newAccessToken = json.getString("access_token");
            String newRefreshToken = json.optString("refresh_token", refreshToken);
            long expiresIn = json.optLong("expires_in", 3600);
            long newExpiresAt = System.currentTimeMillis() / 1000 + expiresIn;

            saveSession(context, newAccessToken, newRefreshToken, newExpiresAt, supabaseUrl, supabaseAnonKey);
            return newAccessToken;
        } catch (Exception e) {
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static String readStream(InputStream is) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[4096];
        int n;
        while ((n = is.read(buffer)) != -1) {
            out.write(buffer, 0, n);
        }
        return out.toString("UTF-8");
    }
}
