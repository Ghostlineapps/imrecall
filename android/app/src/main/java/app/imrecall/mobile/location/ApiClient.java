package app.imrecall.mobile.location;

import android.content.Context;
import androidx.annotation.Nullable;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/**
 * Piccolo helper HTTP per le chiamate autenticate verso le API web
 * (/api/checkin, /api/locations/track, /api/places/mine) dai componenti in
 * background, che non hanno una WebView e quindi autenticano con un bearer
 * token (vedi NativeAuth) invece dei cookie di sessione.
 */
public class ApiClient {
    /** Risposta HTTP con corpo JSON già parsato (null se non c'era un token valido, o su errore di rete/parsing). */
    public static class Result {
        public final int statusCode;
        public final JSONObject body;

        Result(int statusCode, JSONObject body) {
            this.statusCode = statusCode;
            this.body = body;
        }

        public boolean ok() {
            return statusCode >= 200 && statusCode < 300;
        }
    }

    private ApiClient() {}

    @Nullable
    public static Result post(Context context, String path, JSONObject body) {
        String accessToken = NativeAuth.getValidAccessToken(context);
        if (accessToken == null) return null;
        return request(path, "POST", accessToken, body);
    }

    @Nullable
    public static Result get(Context context, String path) {
        String accessToken = NativeAuth.getValidAccessToken(context);
        if (accessToken == null) return null;
        return request(path, "GET", accessToken, null);
    }

    private static Result request(String path, String method, String accessToken, @Nullable JSONObject body) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(NativeAuth.APP_BASE_URL + path);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod(method);
            conn.setRequestProperty("Authorization", "Bearer " + accessToken);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(20000);

            if (body != null) {
                conn.setDoOutput(true);
                try (OutputStream os = conn.getOutputStream()) {
                    os.write(body.toString().getBytes(StandardCharsets.UTF_8));
                }
            }

            int code = conn.getResponseCode();
            InputStream stream = code >= 200 && code < 300 ? conn.getInputStream() : conn.getErrorStream();
            String text = stream != null ? readStream(stream) : "";
            JSONObject json;
            try {
                json = text.isEmpty() ? new JSONObject() : new JSONObject(text);
            } catch (Exception parseError) {
                json = new JSONObject();
            }
            return new Result(code, json);
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
