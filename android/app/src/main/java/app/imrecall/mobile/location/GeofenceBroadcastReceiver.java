package app.imrecall.mobile.location;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import com.google.android.gms.location.Geofence;
import com.google.android.gms.location.GeofencingEvent;
import java.util.List;

/**
 * Riceve le transizioni di geofence registrate da GeofenceSyncWorker. Sulla
 * sola transizione ENTER, per ciascun luogo raggiunto, mette in coda
 * CheckinWorker (WorkManager): la vera chiamata di rete a /api/checkin non
 * va fatta qui — onReceive ha un tempo di esecuzione limitato dal sistema e
 * nessuna garanzia sulla rete, WorkManager gestisce retry e vincoli.
 */
public class GeofenceBroadcastReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        GeofencingEvent event = GeofencingEvent.fromIntent(intent);
        if (event == null || event.hasError()) return;
        if (event.getGeofenceTransition() != Geofence.GEOFENCE_TRANSITION_ENTER) return;

        List<Geofence> triggeringGeofences = event.getTriggeringGeofences();
        if (triggeringGeofences == null) return;

        for (Geofence geofence : triggeringGeofences) {
            CheckinWorker.enqueue(context, geofence.getRequestId());
        }
    }
}
