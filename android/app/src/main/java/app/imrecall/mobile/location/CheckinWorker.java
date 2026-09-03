package app.imrecall.mobile.location;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.Data;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Chiama POST /api/checkin per il luogo su cui è scattato il geofence (vedi
 * GeofenceBroadcastReceiver) e mostra una notifica locale per ciascun
 * candidato di resurfacing appena creato — niente canale push separato,
 * l'endpoint restituisce già titolo/testo pronti (vedi checkin/route.ts).
 */
public class CheckinWorker extends Worker {
    private static final String KEY_PLACE_ID = "place_id";

    public CheckinWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    public static void enqueue(Context context, String placeId) {
        Data input = new Data.Builder().putString(KEY_PLACE_ID, placeId).build();
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(CheckinWorker.class).setInputData(input).build();
        WorkManager.getInstance(context).enqueue(request);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        String placeId = getInputData().getString(KEY_PLACE_ID);
        if (placeId == null) return Result.failure();

        TrackingPrefs.Place place = TrackingPrefs.findPlace(context, placeId);
        if (place == null) return Result.failure();

        try {
            JSONObject body = new JSONObject();
            body.put("latitude", place.latitude);
            body.put("longitude", place.longitude);

            ApiClient.Result response = ApiClient.post(context, "/api/checkin", body);
            if (response == null) return Result.retry();
            // 401: la sessione non è valida (nessun punto nel riprovare finché
            // l'utente non riapre l'app e ne arriva una nuova). Altri errori
            // (5xx, rete) meritano invece un retry con backoff di WorkManager.
            if (response.statusCode == 401) return Result.failure();
            if (!response.ok()) return Result.retry();

            JSONArray candidates = response.body.optJSONArray("candidates");
            if (candidates == null) return Result.success();

            for (int i = 0; i < candidates.length(); i++) {
                JSONObject candidate = candidates.optJSONObject(i);
                if (candidate == null) continue;

                String title = candidate.optString("title", "IMRECALL");
                String body2 = candidate.optString("body", "");
                // notificationId univoco per luogo+indice, per non sovrascrivere
                // notifiche di arrivi diversi mostrate nella stessa sessione.
                int notificationId = (placeId + "_" + i).hashCode();
                NotificationHelper.showPlaceNotification(context, notificationId, title, body2);
            }

            return Result.success();
        } catch (Exception e) {
            return Result.retry();
        }
    }
}
