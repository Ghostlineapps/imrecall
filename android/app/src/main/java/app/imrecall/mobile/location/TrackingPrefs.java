package app.imrecall.mobile.location;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Preferenze native non sensibili (a differenza di NativeAuth, che salva i
 * token in EncryptedSharedPreferences): il flag "tracking attivo" — usato da
 * BootReceiver per sapere se riavviare il Foreground Service dopo un riavvio
 * del telefono — e la cache dei luoghi sincronizzati da /api/places/mine,
 * usata da GeofenceBroadcastReceiver per risalire da un geofence (che porta
 * solo l'id come request-id) a nome/coordinate del luogo.
 */
public class TrackingPrefs {
    private static final String PREFS_NAME = "imrecall_native_tracking";
    private static final String KEY_TRACKING_ENABLED = "tracking_enabled";
    private static final String KEY_PLACES_CACHE = "places_cache";

    public static class Place {
        public final String id;
        public final String name;
        public final double latitude;
        public final double longitude;
        public final String granularity;

        public Place(String id, String name, double latitude, double longitude, String granularity) {
            this.id = id;
            this.name = name;
            this.latitude = latitude;
            this.longitude = longitude;
            this.granularity = granularity;
        }
    }

    private TrackingPrefs() {}

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    public static void setTrackingEnabled(Context context, boolean enabled) {
        prefs(context).edit().putBoolean(KEY_TRACKING_ENABLED, enabled).apply();
    }

    public static boolean isTrackingEnabled(Context context) {
        return prefs(context).getBoolean(KEY_TRACKING_ENABLED, false);
    }

    public static void savePlaces(Context context, List<Place> places) {
        try {
            JSONArray arr = new JSONArray();
            for (Place p : places) {
                JSONObject o = new JSONObject();
                o.put("id", p.id);
                o.put("name", p.name);
                o.put("latitude", p.latitude);
                o.put("longitude", p.longitude);
                o.put("granularity", p.granularity);
                arr.put(o);
            }
            prefs(context).edit().putString(KEY_PLACES_CACHE, arr.toString()).apply();
        } catch (JSONException ignored) {
        }
    }

    public static List<Place> loadPlaces(Context context) {
        List<Place> result = new ArrayList<>();
        String raw = prefs(context).getString(KEY_PLACES_CACHE, null);
        if (raw == null) return result;

        try {
            JSONArray arr = new JSONArray(raw);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.getJSONObject(i);
                result.add(
                    new Place(
                        o.getString("id"),
                        o.optString("name", ""),
                        o.getDouble("latitude"),
                        o.getDouble("longitude"),
                        o.optString("granularity", "poi")
                    )
                );
            }
        } catch (JSONException ignored) {
        }
        return result;
    }

    public static Place findPlace(Context context, String id) {
        for (Place p : loadPlaces(context)) {
            if (p.id.equals(id)) return p;
        }
        return null;
    }
}
