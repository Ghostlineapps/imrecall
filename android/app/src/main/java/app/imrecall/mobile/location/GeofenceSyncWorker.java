package app.imrecall.mobile.location;

import android.annotation.SuppressLint;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import com.google.android.gms.location.Geofence;
import com.google.android.gms.location.GeofencingClient;
import com.google.android.gms.location.GeofencingRequest;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.tasks.Tasks;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Sincronizza periodicamente i luoghi dell'utente (GET /api/places/mine) e
 * registra/aggiorna i relativi geofence con GeofencingClient — vedi il piano
 * tecnico sul geofencing. Girato da WorkManager: periodico ogni ~8 ore, più
 * on-demand all'avvio del tracciamento e a ogni riavvio del telefono.
 *
 * Raggio di default per granularità (niente colonna raggio sui luoghi):
 * "poi" 150m, "address" 120m, "city" esclusa perché troppo imprecisa per un
 * ingresso/uscita affidabile.
 */
public class GeofenceSyncWorker extends Worker {
    private static final String UNIQUE_PERIODIC_NAME = "imrecall_geofence_sync_periodic";
    private static final String UNIQUE_ONE_TIME_NAME = "imrecall_geofence_sync_now";
    private static final long PERIODIC_INTERVAL_HOURS = 8;
    private static final double RADIUS_POI_METERS = 150;
    private static final double RADIUS_ADDRESS_METERS = 120;
    // Android permette al massimo 100 geofence per app: /api/places/mine ne
    // restituisce già al più 80, margine di sicurezza applicato comunque qui.
    private static final int MAX_GEOFENCES = 90;

    public GeofenceSyncWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    public static void scheduleNow(Context context) {
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(GeofenceSyncWorker.class).build();
        WorkManager.getInstance(context).enqueueUniqueWork(UNIQUE_ONE_TIME_NAME, ExistingWorkPolicy.REPLACE, request);
    }

    public static void schedulePeriodic(Context context) {
        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(
            GeofenceSyncWorker.class,
            PERIODIC_INTERVAL_HOURS,
            TimeUnit.HOURS
        ).build();
        WorkManager.getInstance(context)
            .enqueueUniquePeriodicWork(UNIQUE_PERIODIC_NAME, ExistingPeriodicWorkPolicy.KEEP, request);
    }

    public static void cancelPeriodic(Context context) {
        WorkManager.getInstance(context).cancelUniqueWork(UNIQUE_PERIODIC_NAME);
    }

    @SuppressLint("MissingPermission")
    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        if (!TrackingPrefs.isTrackingEnabled(context)) return Result.success();

        ApiClient.Result response = ApiClient.get(context, "/api/places/mine");
        if (response == null) {
            // Nessun token valido al momento: non è un errore permanente,
            // ci riproverà il prossimo giro periodico o on-demand.
            return Result.success();
        }
        // 401: la sessione non è valida, nessun punto nel riprovare finché
        // l'utente non riapre l'app e ne arriva una nuova.
        if (response.statusCode == 401) return Result.failure();
        if (!response.ok()) return Result.retry();

        List<TrackingPrefs.Place> previousPlaces = TrackingPrefs.loadPlaces(context);
        List<TrackingPrefs.Place> places = parsePlaces(response.body);
        TrackingPrefs.savePlaces(context, places);

        removeStaleGeofences(context, previousPlaces, places);
        registerGeofences(context, places);
        return Result.success();
    }

    private List<TrackingPrefs.Place> parsePlaces(JSONObject body) {
        List<TrackingPrefs.Place> places = new ArrayList<>();
        JSONArray arr = body.optJSONArray("places");
        if (arr == null) return places;

        for (int i = 0; i < arr.length(); i++) {
            JSONObject o = arr.optJSONObject(i);
            if (o == null) continue;

            String granularity = o.optString("granularity", "");
            // "city" è esclusa dal geofencing: troppo imprecisa.
            if (!"poi".equals(granularity) && !"address".equals(granularity)) continue;
            if (o.isNull("latitude") || o.isNull("longitude")) continue;

            places.add(
                new TrackingPrefs.Place(
                    o.optString("id"),
                    o.optString("name", ""),
                    o.optDouble("latitude"),
                    o.optDouble("longitude"),
                    granularity
                )
            );
            if (places.size() >= MAX_GEOFENCES) break;
        }
        return places;
    }

    // Un luogo eliminato o non più idoneo (granularità cambiata, coordinate
    // rimosse) non compare più nella lista fresca: il suo geofence va tolto
    // esplicitamente, altrimenti resta registrato per sempre e nel tempo si
    // arriva al limite di 100 geofence per app imposto da Android.
    private void removeStaleGeofences(
        Context context,
        List<TrackingPrefs.Place> previousPlaces,
        List<TrackingPrefs.Place> currentPlaces
    ) {
        if (previousPlaces.isEmpty()) return;

        List<String> currentIds = new ArrayList<>();
        for (TrackingPrefs.Place place : currentPlaces) currentIds.add(place.id);

        List<String> staleIds = new ArrayList<>();
        for (TrackingPrefs.Place place : previousPlaces) {
            if (!currentIds.contains(place.id)) staleIds.add(place.id);
        }
        if (staleIds.isEmpty()) return;

        try {
            GeofencingClient geofencingClient = LocationServices.getGeofencingClient(context);
            Tasks.await(geofencingClient.removeGeofences(staleIds), 20, TimeUnit.SECONDS);
        } catch (Exception ignored) {
            // Non bloccante: nel peggiore dei casi un geofence obsoleto resta
            // registrato fino al prossimo sync riuscito.
        }
    }

    private void registerGeofences(Context context, List<TrackingPrefs.Place> places) {
        GeofencingClient geofencingClient = LocationServices.getGeofencingClient(context);

        List<Geofence> geofences = new ArrayList<>();
        for (TrackingPrefs.Place place : places) {
            if (place.id == null || place.id.isEmpty()) continue;
            double radius = "poi".equals(place.granularity) ? RADIUS_POI_METERS : RADIUS_ADDRESS_METERS;

            geofences.add(
                new Geofence.Builder()
                    .setRequestId(place.id)
                    .setCircularRegion(place.latitude, place.longitude, (float) radius)
                    // Nessuna scadenza: risincronizzato periodicamente da questo worker.
                    .setExpirationDuration(Geofence.NEVER_EXPIRE)
                    .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_ENTER)
                    .build()
            );
        }

        if (geofences.isEmpty()) return;

        GeofencingRequest request = new GeofencingRequest.Builder()
            .setInitialTrigger(GeofencingRequest.INITIAL_TRIGGER_ENTER)
            .addGeofences(geofences)
            .build();

        try {
            // addGeofences con lo stesso requestId sostituisce il geofence
            // precedente, quindi non serve rimuoverli esplicitamente prima:
            // vedi documentazione GeofencingClient.
            Tasks.await(geofencingClient.addGeofences(request, geofencePendingIntent(context)), 20, TimeUnit.SECONDS);
        } catch (Exception ignored) {
            // Non bloccante: se la registrazione fallisce (es. limite di
            // sistema raggiunto), riproverà il prossimo sync periodico.
        }
    }

    static PendingIntent geofencePendingIntent(Context context) {
        Intent intent = new Intent(context, GeofenceBroadcastReceiver.class);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) flags |= PendingIntent.FLAG_MUTABLE;
        return PendingIntent.getBroadcast(context, 0, intent, flags);
    }
}
