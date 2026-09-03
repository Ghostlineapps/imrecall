package app.imrecall.mobile.location;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Android non riavvia da solo i Foreground Service dopo un riavvio del
 * telefono: se il tracciamento era attivo (TrackingPrefs, non i token —
 * quelli restano validi tra i riavvii), lo si fa ripartire qui e si
 * risincronizzano i geofence.
 */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
        if (!TrackingPrefs.isTrackingEnabled(context)) return;
        if (!NativeAuth.hasSession(context)) return;

        LocationTrackingService.start(context);
    }
}
