package app.imrecall.mobile;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import androidx.core.content.ContextCompat;
import app.imrecall.mobile.location.AuthBridgePlugin;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AuthBridgePlugin.class);
        super.onCreate(savedInstanceState);

        // 2026-09-03: prova diretta sul dispositivo dell'utente —
        // getUserMedia() nella pagina web fallisce con
        // "NotAllowedError: Permission denied" anche con RECORD_AUDIO
        // già concesso da Impostazioni Android (verificato via
        // screenshot) e anche dopo aver richiesto esplicitamente il
        // permesso lato JS prima della chiamata. Questo esclude sia il
        // permesso di sistema sia un problema del codice web: l'unico
        // punto che può produrre quell'esatto errore è la risposta della
        // WebView alla PermissionRequest interna che getUserMedia()
        // genera. Capacitor gestisce già questo di default in
        // BridgeWebChromeClient.onPermissionRequest, ma passa per un
        // ActivityResultLauncher — lo stesso genere di indirizione
        // asincrona che nel bridge nativo di posizione (vedi
        // nativeGeolocation.ts, commento 2026-09-01) si è già dimostrata
        // inaffidabile su questo device. Qui sostituiamo quel passaggio
        // con una risposta sincrona e diretta: controlliamo il permesso
        // Android già concesso e rispondiamo subito alla WebView, senza
        // nessun giro asincrono aggiuntivo.
        this.bridge
            .getWebView()
            .setWebChromeClient(
                new BridgeWebChromeClient(this.bridge) {
                    @Override
                    public void onPermissionRequest(final PermissionRequest request) {
                        boolean audioGranted =
                            ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.RECORD_AUDIO)
                                == PackageManager.PERMISSION_GRANTED;
                        boolean cameraGranted =
                            ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.CAMERA)
                                == PackageManager.PERMISSION_GRANTED;

                        List<String> toGrant = new ArrayList<>();
                        for (String resource : request.getResources()) {
                            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource) && audioGranted) {
                                toGrant.add(resource);
                            } else if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource) && cameraGranted) {
                                toGrant.add(resource);
                            }
                        }

                        if (!toGrant.isEmpty()) {
                            request.grant(toGrant.toArray(new String[0]));
                        } else {
                            request.deny();
                        }
                    }
                }
            );
    }
}
