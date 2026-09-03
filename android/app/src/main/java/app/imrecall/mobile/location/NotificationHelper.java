package app.imrecall.mobile.location;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import app.imrecall.mobile.MainActivity;
import app.imrecall.mobile.R;

/**
 * Due canali di notifica distinti:
 * - "tracking": la notifica persistente e silenziosa richiesta dal
 *   Foreground Service mentre il tracciamento/geofencing è attivo (vedi
 *   LocationTrackingService) — è un requisito di Android 8+, ed è la scelta
 *   di affidabilità già confermata dall'utente rispetto a un tracking
 *   invisibile.
 * - "places": i promemoria veri e propri quando si arriva in un posto legato
 *   a un ricordo (vedi CheckinWorker), questi sì visibili/sonori come una
 *   notifica normale.
 */
public class NotificationHelper {
    // Nota: il nome del canale è cambiato da "imrecall_tracking" a
    // "imrecall_tracking_v2" apposta. Android NON permette di cambiare
    // l'importanza di un canale già creato su un telefono (le chiamate
    // successive a createNotificationChannel con lo stesso ID vengono
    // ignorate) — sul telefono di test il canale "imrecall_tracking" era
    // già stato creato con IMPORTANCE_MIN da un'installazione precedente,
    // quindi limitarsi ad alzare IMPORTANCE_MIN → IMPORTANCE_LOW nel codice
    // non avrebbe avuto alcun effetto senza anche un ID nuovo, che forza la
    // creazione di un canale pulito con l'importanza corretta.
    public static final String CHANNEL_TRACKING = "imrecall_tracking_v2";
    public static final String CHANNEL_PLACES = "imrecall_places";
    public static final int TRACKING_NOTIFICATION_ID = 1001;

    private NotificationHelper() {}

    public static void ensureChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;

        // IMPORTANCE_MIN (usato in precedenza) rende la notifica così poco
        // prioritaria che su alcuni telefoni — in particolare Xiaomi/MIUI,
        // che è già aggressivo nel nascondere le notifiche a bassa
        // importanza — sparisce del tutto dalla tendina, anche se il
        // servizio è realmente attivo. Segnalato dall'utente: "non esce
        // nessuna notifica" nonostante permessi concessi e servizio in
        // esecuzione. IMPORTANCE_LOW resta silenzioso (niente suono, non
        // compare a schermo come popup) ma Android garantisce che sia
        // sempre visibile nella tendina — è anche il livello che Android
        // stesso raccomanda per le notifiche persistenti dei Foreground
        // Service, proprio per questo motivo.
        NotificationChannel tracking = new NotificationChannel(
            CHANNEL_TRACKING,
            "Monitoraggio posizione",
            NotificationManager.IMPORTANCE_LOW
        );
        tracking.setDescription("Notifica persistente mentre IMRECALL monitora la posizione in background.");
        tracking.setShowBadge(false);
        manager.createNotificationChannel(tracking);

        NotificationChannel places = new NotificationChannel(
            CHANNEL_PLACES,
            "Promemoria luoghi",
            NotificationManager.IMPORTANCE_HIGH
        );
        places.setDescription("Promemoria quando arrivi in un posto legato a un ricordo o un'intenzione.");
        manager.createNotificationChannel(places);
    }

    public static Notification buildTrackingNotification(Context context) {
        ensureChannels(context);

        Intent openApp = new Intent(context, MainActivity.class);
        openApp.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent contentIntent = PendingIntent.getActivity(context, 0, openApp, flags);

        return new NotificationCompat.Builder(context, CHANNEL_TRACKING)
            .setContentTitle("IMRECALL sta monitorando la posizione")
            .setContentText("Per i promemoria d'arrivo e la cronologia spostamenti.")
            .setSmallIcon(R.drawable.ic_notification)
            .setOngoing(true)
            // Allineato a IMPORTANCE_LOW del canale sopra: PRIORITY_MIN qui
            // (retaggio delle API pre-canali, ma ancora letto su alcuni
            // sistemi) contribuiva a far collassare/nascondere la notifica
            // insieme a IMPORTANCE_MIN. PRIORITY_LOW resta comunque
            // silenzioso, solo garantito visibile.
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(contentIntent)
            .build();
    }

    public static void showPlaceNotification(Context context, int notificationId, String title, String body) {
        ensureChannels(context);

        Intent openApp = new Intent(context, MainActivity.class);
        openApp.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent contentIntent = PendingIntent.getActivity(context, notificationId, openApp, flags);

        Notification notification = new NotificationCompat.Builder(context, CHANNEL_PLACES)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setSmallIcon(R.drawable.ic_notification)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(contentIntent)
            .build();

        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager != null) manager.notify(notificationId, notification);
    }
}
