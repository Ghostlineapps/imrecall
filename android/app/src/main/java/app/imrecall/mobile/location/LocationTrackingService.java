package app.imrecall.mobile.location;

import android.annotation.SuppressLint;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.location.Location;
import android.os.IBinder;
import android.os.Looper;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

/**
 * Foreground Service con notifica persistente che tiene traccia della
 * posizione con campionamento adattivo + stop-detection (vedi piano
 * tecnico): rado mentre ci si muove, più fitto solo per confermare una
 * sosta, poi un ping raro finché non si torna a muoversi. Sostituisce il
 * vecchio setInterval a 10 minuti fisso, che funzionava solo a tab aperta.
 *
 * Gestisce anche la registrazione dei geofence (GeofenceSyncWorker), perché
 * condivide con quella la stessa notifica persistente e lo stesso ciclo di
 * vita "tracking attivo/disattivo".
 */
public class LocationTrackingService extends Service {
    private static final String ACTION_STOP = "app.imrecall.mobile.location.action.STOP";

    // Vedi il piano tecnico per i range di riferimento di questi valori.
    private static final long SPARSE_INTERVAL_MS = 4 * 60 * 1000; // rado: ogni 3-5 minuti
    private static final long DENSE_INTERVAL_MS = 45 * 1000; // fitto: ogni 30-60 secondi
    private static final long STOP_CONFIRM_MS = 7 * 60 * 1000; // sosta confermata dopo 5-10 minuti fermi
    private static final long STILL_HERE_INTERVAL_MS = 20 * 60 * 1000; // ping raro mentre fermi
    // Soglia stretta, pensata per confrontare due fix GPS precisi tra loro
    // (es. durante STATE_CONFIRMING, dove entrambi i fix vengono da
    // PRIORITY_HIGH_ACCURACY).
    private static final float STOP_RADIUS_METERS = 50f;
    // Soglia larga, usata ogni volta che si confronta un fix RADO
    // (Wi-Fi/celle, PRIORITY_BALANCED_POWER_ACCURACY) con un punto di
    // riferimento preciso: un fix rado può "saltare" anche di centinaia di
    // metri rispetto alla posizione reale pur restando fermi, quindi usare
    // qui la soglia stretta di STOP_RADIUS_METERS produceva falsi
    // "ci si è mossi" che facevano rimbalzare lo stato indietro prima ancora
    // di ottenere un fix GPS preciso — risultato: la sosta non veniva quasi
    // mai confermata e la posizione mostrata restava sempre quella
    // approssimata al livello della città.
    private static final float COARSE_VS_PRECISE_RADIUS_METERS = 300f;

    private static final int STATE_SPARSE = 0;
    private static final int STATE_CONFIRMING = 1;
    private static final int STATE_STOPPED = 2;

    private FusedLocationProviderClient fusedClient;
    private LocationCallback locationCallback;
    private ExecutorService networkExecutor;

    private int state = STATE_SPARSE;
    private Location anchorLocation; // ultimo punto di riferimento in modalità SPARSE
    private Location stopAnchorLocation; // punto preciso della sosta (stabilito dal primo fix GPS in CONFIRMING)
    // Il fix più accurato osservato durante STATE_CONFIRMING: il primo fix
    // GPS dopo il cambio di priorità può ancora essere impreciso (il GPS
    // impiega qualche secondo/minuto a "agganciarsi", soprattutto in casa),
    // quindi teniamo il migliore visto nella finestra invece di usare
    // sempre e solo l'ultimo arrivato.
    private Location bestConfirmingFix;
    private long stopAnchorTime;
    private long lastSparseSentAt;
    private long lastStillHereSentAt;
    // Evita che una chiamata ripetuta a startTracking() (es. l'utente
    // riapre la pagina Impostazioni > Spostamenti mentre il tracciamento
    // e' gia' attivo) butti via una sosta che si stava per confermare:
    // senza questa guardia, onStartCommand() richiamava resetState() ad
    // ogni avvio, riportando lo stato a SPARSE anche a meta' di una
    // conferma di sosta gia' in corso.
    private boolean isRunning = false;

    public static void start(Context context) {
        TrackingPrefs.setTrackingEnabled(context, true);
        Intent intent = new Intent(context, LocationTrackingService.class);
        ContextCompat.startForegroundService(context, intent);
    }

    public static void stop(Context context) {
        TrackingPrefs.setTrackingEnabled(context, false);
        Intent intent = new Intent(context, LocationTrackingService.class);
        intent.setAction(ACTION_STOP);
        context.startService(intent);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        fusedClient = LocationServices.getFusedLocationProviderClient(this);
        networkExecutor = Executors.newSingleThreadExecutor();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopTracking();
            TrackingDebugState.markStopped(this);
            stopSelf();
            return START_NOT_STICKY;
        }

        if (isRunning) {
            // Gia' in esecuzione: non tocchiamo lo stato adattivo (potremmo
            // essere a meta' di una conferma di sosta), ma riallineiamo comunque
            // i geofence, cosi' riaprire l'app resta un modo valido per
            // aggiornare i luoghi anche senza aspettare il sync periodico.
            GeofenceSyncWorker.scheduleNow(this);
            return START_STICKY;
        }

        // startForegroundService() lato JS/plugin è asincrono: se qualcosa
        // qui dentro lancia un'eccezione (es. startForeground rifiutato dal
        // sistema, un problema nella notifica), il chiamante JS non lo vede
        // mai — call.resolve() è già tornato molto prima. Questo try/catch
        // registra cosa succede davvero in TrackingDebugState, leggibile
        // dal lato web tramite AuthBridgePlugin.getTrackingDebugState(),
        // invece di lasciare il servizio morire in silenzio.
        TrackingDebugState.markStarting(this);
        try {
            ServiceCompat.startForeground(
                this,
                NotificationHelper.TRACKING_NOTIFICATION_ID,
                NotificationHelper.buildTrackingNotification(this),
                android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
            );
            TrackingDebugState.markRunning(this);
            isRunning = true;

            resetState();
            startLocationUpdates(SPARSE_INTERVAL_MS);
            GeofenceSyncWorker.scheduleNow(this);
            GeofenceSyncWorker.schedulePeriodic(this);
        } catch (Exception e) {
            isRunning = false;
            TrackingDebugState.markError(this, e.getClass().getSimpleName() + ": " + e.getMessage());
            stopSelf();
            return START_NOT_STICKY;
        }

        // START_STICKY: se il sistema uccide il processo per pressione di
        // memoria, prova a far ripartire il service (senza l'intent
        // originale) — onStartCommand verrà richiamato con intent null e
        // riprenderà semplicemente dallo stato SPARSE.
        return START_STICKY;
    }

    private void resetState() {
        state = STATE_SPARSE;
        anchorLocation = null;
        stopAnchorLocation = null;
        bestConfirmingFix = null;
        stopAnchorTime = 0;
        lastSparseSentAt = 0;
        lastStillHereSentAt = 0;
    }

    private void stopTracking() {
        isRunning = false;
        if (fusedClient != null && locationCallback != null) {
            fusedClient.removeLocationUpdates(locationCallback);
        }
        GeofenceSyncWorker.cancelPeriodic(this);
        ServiceCompat.stopForeground(this, Service.STOP_FOREGROUND_REMOVE);
    }

    private void startLocationUpdates(long intervalMs) {
        // Rado/risparmio energetico per default: mentre ci si muove basta
        // una stima approssimativa (Wi-Fi/celle) per capire la traiettoria
        // generale, non serve accendere il GPS di continuo.
        startLocationUpdates(intervalMs, Priority.PRIORITY_BALANCED_POWER_ACCURACY);
    }

    @SuppressLint("MissingPermission")
    private void startLocationUpdates(long intervalMs, int priority) {
        if (fusedClient == null) return;

        if (locationCallback != null) {
            fusedClient.removeLocationUpdates(locationCallback);
        }

        LocationRequest request = new LocationRequest.Builder(priority, intervalMs)
            .setMinUpdateIntervalMillis(intervalMs / 2)
            .build();

        locationCallback = new LocationCallback() {
            @Override
            public void onLocationResult(LocationResult result) {
                Location location = result.getLastLocation();
                if (location != null) handleNewLocation(location);
            }
        };

        fusedClient.requestLocationUpdates(request, locationCallback, Looper.getMainLooper());
    }

    private void handleNewLocation(Location location) {
        long now = System.currentTimeMillis();

        switch (state) {
            case STATE_SPARSE:
                handleSparse(location, now);
                break;
            case STATE_CONFIRMING:
                handleConfirming(location, now);
                break;
            case STATE_STOPPED:
                handleStopped(location, now);
                break;
        }
    }

    private void handleSparse(Location location, long now) {
        if (anchorLocation != null && anchorLocation.distanceTo(location) < COARSE_VS_PRECISE_RADIUS_METERS) {
            // Possibile inizio sosta: passa a campionamento fitto per confermare,
            // e stavolta con GPS preciso (non solo Wi-Fi/celle) — è il momento
            // in cui la posizione salvata deve essere davvero accurata, sia
            // per il confronto con i geofence sia per la cronologia spostamenti.
            //
            // Non fissiamo qui il punto di riferimento della sosta: il fix
            // rado appena ricevuto (location) è impreciso, quindi lasciamo
            // che sia handleConfirming a stabilirlo dal primo fix GPS vero
            // e proprio — altrimenti ogni confronto successivo userebbe
            // come riferimento un punto impreciso, con lo stesso problema
            // di falsi "ci si è mossi" descritto sopra.
            state = STATE_CONFIRMING;
            stopAnchorLocation = null;
            bestConfirmingFix = null;
            stopAnchorTime = 0;
            startLocationUpdates(DENSE_INTERVAL_MS, Priority.PRIORITY_HIGH_ACCURACY);
            return;
        }

        anchorLocation = location;
        if (now - lastSparseSentAt >= SPARSE_INTERVAL_MS) {
            sendPoint(location, "live_sparse");
            lastSparseSentAt = now;
        }
    }

    private void handleConfirming(Location location, long now) {
        if (stopAnchorLocation == null) {
            // Primo fix GPS in modalità fitta: diventa il riferimento della
            // sosta. Da qui in poi i confronti sono GPS-contro-GPS, quindi
            // la soglia stretta STOP_RADIUS_METERS torna ad avere senso.
            stopAnchorLocation = location;
            stopAnchorTime = now;
            bestConfirmingFix = location;
            return;
        }

        if (stopAnchorLocation.distanceTo(location) >= STOP_RADIUS_METERS) {
            // Ci si è mossi prima di confermare: era solo una sosta breve
            // (es. semaforo), si torna al campionamento rado.
            state = STATE_SPARSE;
            anchorLocation = location;
            stopAnchorLocation = null;
            bestConfirmingFix = null;
            startLocationUpdates(SPARSE_INTERVAL_MS);
            if (now - lastSparseSentAt >= SPARSE_INTERVAL_MS) {
                sendPoint(location, "live_sparse");
                lastSparseSentAt = now;
            }
            return;
        }

        if (bestConfirmingFix == null || location.getAccuracy() < bestConfirmingFix.getAccuracy()) {
            bestConfirmingFix = location;
        }

        if (now - stopAnchorTime >= STOP_CONFIRM_MS) {
            // Sosta confermata: un solo evento per questa sosta, con il fix
            // più accurato visto durante la conferma (non necessariamente
            // l'ultimo arrivato).
            state = STATE_STOPPED;
            sendPoint(bestConfirmingFix, "live_stop");
            lastStillHereSentAt = now;
            startLocationUpdates(SPARSE_INTERVAL_MS);
        }
        // Altrimenti si continua ad aspettare con il campionamento fitto già attivo.
    }

    private void handleStopped(Location location, long now) {
        // Il fix appena ricevuto qui è di nuovo rado (risparmio energetico),
        // quindi va confrontato con la soglia larga rispetto al punto
        // preciso della sosta, non con quella stretta — stesso motivo di
        // COARSE_VS_PRECISE_RADIUS_METERS sopra.
        if (stopAnchorLocation == null || stopAnchorLocation.distanceTo(location) >= COARSE_VS_PRECISE_RADIUS_METERS) {
            // Ripartiti: si torna al campionamento rado.
            state = STATE_SPARSE;
            anchorLocation = location;
            stopAnchorLocation = null;
            bestConfirmingFix = null;
            lastSparseSentAt = now;
            sendPoint(location, "live_sparse");
            return;
        }

        if (now - lastStillHereSentAt >= STILL_HERE_INTERVAL_MS) {
            // Reinviamo il punto preciso già confermato (stopAnchorLocation),
            // non il fix rado appena ricevuto: siamo ancora nello stesso
            // posto, non serve un nuovo GPS per saperlo, e sovrascrivere la
            // voce precisa con una approssimata farebbe ricomparire solo il
            // nome della città al posto dell'indirizzo esatto già trovato.
            sendPoint(stopAnchorLocation, "live_stop");
            lastStillHereSentAt = now;
        }
    }

    // Date.toInstant() richiede API 26+: con minSdk 24 serve un formatter
    // manuale compatibile con tutte le versioni supportate.
    private static String isoTimestamp(long millis) {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(new Date(millis));
    }

    private void sendPoint(Location location, String source) {
        double latitude = location.getLatitude();
        double longitude = location.getLongitude();
        float accuracy = location.getAccuracy();
        long timestampMs = location.getTime();

        networkExecutor.execute(() -> {
            try {
                JSONObject body = new JSONObject();
                body.put("latitude", latitude);
                body.put("longitude", longitude);
                body.put("accuracy", accuracy);
                body.put("recorded_at", isoTimestamp(timestampMs));
                body.put("source", source);
                ApiClient.post(this.getApplicationContext(), "/api/locations/track", body);
            } catch (Exception ignored) {
                // Non bloccante: un punto perso non è grave, il prossimo tentativo
                // arriva al giro di campionamento successivo.
            }
        });
    }

    @Override
    public void onDestroy() {
        isRunning = false;
        TrackingDebugState.markStopped(this);
        if (fusedClient != null && locationCallback != null) {
            fusedClient.removeLocationUpdates(locationCallback);
        }
        if (networkExecutor != null) networkExecutor.shutdown();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
