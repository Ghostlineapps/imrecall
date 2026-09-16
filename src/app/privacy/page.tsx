import Link from "next/link";

export const metadata = {
  title: "Informativa sulla Privacy — IMRECALL",
};

// Pagina pubblica (fuori dal gruppo di rotte (app)): raggiungibile senza
// login, come richiesto sia dal Play Store sia dal GDPR per una privacy
// policy. Tema celeste per coerenza visiva con Impostazioni, da cui è
// linkata. Contenuto redatto sulla base delle funzionalità e dei fornitori
// terzi effettivamente presenti nel codice al 2026-09-16 (aggiornata per
// l'aggiunta di Vercel Analytics, vedi src/app/layout.tsx) — va rivisto da
// un legale prima della pubblicazione sul Play Store, in particolare per le
// clausole sul trasferimento dati extra-SEE e per l'eventuale nomina di un
// rappresentante UE (art. 27 GDPR), dato che il Titolare ha sede a Hong Kong.
export default function PrivacyPage() {
  return (
    <div className="bg-celeste-bg min-h-full px-4 pt-6 pb-10 space-y-8 text-celeste-navy">
      <div>
        <Link href="/settings" className="text-celeste-muted text-sm">
          ← Impostazioni
        </Link>
      </div>

      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Informativa sulla Privacy</h1>
        <p className="text-xs text-celeste-muted">Ultimo aggiornamento: 16 settembre 2026</p>
      </div>

      <section className="space-y-2">
        <h2 className="font-medium">Titolare del trattamento</h2>
        <p className="text-sm text-celeste-muted">
          Il Titolare del trattamento dei dati personali raccolti tramite IMRECALL è{" "}
          <strong className="text-celeste-navy">Axis Trade Partners Limited</strong>, con sede in Unit
          903B, 9/F., Cameron Commercial Centre, 458-468 Hennessy Road, Causeway Bay, Hong Kong. Per
          qualsiasi richiesta relativa alla privacy o per esercitare i diritti descritti in questa
          informativa puoi scriverci a{" "}
          <a href="mailto:info@axistpl.hk" className="text-celeste-accentDark">
            info@axistpl.hk
          </a>
          .
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Cosa fa IMRECALL</h2>
        <p className="text-sm text-celeste-muted">
          IMRECALL è un&apos;app personale per catturare e ritrovare ricordi, appuntamenti e
          informazioni utili della vita quotidiana: foto, documenti, note vocali, promemoria di
          scadenze e, se lo desideri, funzioni facoltative come il tracciamento di farmaci, ciclo
          mestruale, gravidanza e posizione.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Dati che raccogliamo</h2>
        <p className="text-sm text-celeste-muted">
          <strong className="text-celeste-navy">Dati dell&apos;account:</strong> email, nome,
          eventuale immagine del profilo, lingua preferita.
        </p>
        <p className="text-sm text-celeste-muted">
          <strong className="text-celeste-navy">Contenuti che salvi:</strong> foto, documenti, audio e
          note di riunioni che carichi, insieme ai riassunti e alle categorizzazioni che generiamo
          automaticamente per aiutarti a ritrovarli.
        </p>
        <p className="text-sm text-celeste-muted">
          <strong className="text-celeste-navy">Preferenze di profilo:</strong> abitudini alimentari,
          interessi, budget mensile.
        </p>
        <p className="text-sm text-celeste-muted">
          <strong className="text-celeste-navy">Dati sanitari, solo se attivi tu queste funzioni:</strong>{" "}
          promemoria farmaci, tracciamento del ciclo mestruale (inclusa la modalità impostata, es.
          ricerca o prevenzione di una gravidanza, sintomi, umore, temperatura basale se la inserisci) e
          dati di gravidanza.
        </p>
        <p className="text-sm text-celeste-muted">
          <strong className="text-celeste-navy">Posizione:</strong> se attivi il tracciamento,
          registriamo le tue soste per suggerirti promemoria legati ai luoghi che salvi (Casa, Lavoro,
          ecc.) e punti di interesse nelle vicinanze.
        </p>
        <p className="text-sm text-celeste-muted">
          <strong className="text-celeste-navy">Appuntamenti, scadenze e spese</strong> che inserisci
          manualmente, incluse eventuali foto di ricevute.
        </p>
        <p className="text-sm text-celeste-muted">
          <strong className="text-celeste-navy">Email, solo se colleghi Gmail o Outlook:</strong>{" "}
          leggiamo oggetto, mittente, data e corpo dei messaggi per rilevare automaticamente
          appuntamenti tramite intelligenza artificiale. Questa funzione si attiva solo se scegli di
          collegare l&apos;account in Impostazioni → Integrazioni, e puoi scollegarlo in qualsiasi
          momento.
        </p>
        <p className="text-sm text-celeste-muted">
          <strong className="text-celeste-navy">Dati di pagamento:</strong> se sottoscrivi un piano a
          pagamento, i dati della carta sono gestiti direttamente da Stripe, il nostro fornitore di
          servizi di pagamento — non li vediamo né li conserviamo noi.
        </p>
        <p className="text-sm text-celeste-muted">
          <strong className="text-celeste-navy">Dati tecnici per le notifiche push:</strong>{" "}
          l&apos;identificativo del tuo dispositivo necessario per inviarti le notifiche che hai
          attivato.
        </p>
        <p className="text-sm text-celeste-muted">
          <strong className="text-celeste-navy">Dati di utilizzo anonimi e aggregati:</strong>{" "}
          tramite Vercel Analytics raccogliamo statistiche su come viene usata l&apos;app — ad esempio
          pagine più visitate, paese di provenienza approssimativo e tipo di dispositivo — senza
          identificarti individualmente. Maggiori dettagli nella sezione &quot;Cookie&quot; qui sotto.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Come usiamo i tuoi dati</h2>
        <p className="text-sm text-celeste-muted">
          Usiamo i tuoi dati per fornirti le funzionalità dell&apos;app, generare riassunti e
          categorizzazioni automatiche dei contenuti tramite intelligenza artificiale, inviarti i
          promemoria e le notifiche che hai richiesto, elaborare i pagamenti dei piani a pagamento, e
          suggerirti luoghi o promemoria in base alla posizione se hai attivato questa funzione.
          Usiamo inoltre le statistiche aggregate e anonime di Vercel Analytics per capire come viene
          usata l&apos;app e migliorarla. Non usiamo i tuoi dati per pubblicità e non li vendiamo a
          terzi.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Basi giuridiche del trattamento</h2>
        <p className="text-sm text-celeste-muted">
          Trattiamo i tuoi dati per eseguire il contratto di servizio che accetti registrandoti. Per le
          categorie di dati più sensibili — dati sanitari, posizione, notifiche push, collegamento di
          Gmail/Outlook — ci basiamo sul tuo consenso esplicito, che presti attivando la relativa
          funzione e che puoi revocare in qualsiasi momento disattivandola dalle Impostazioni. Per la
          sicurezza del servizio e per le statistiche di utilizzo aggregate e anonime descritte sopra
          ci basiamo inoltre sul nostro legittimo interesse a mantenere e migliorare il servizio.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Con chi condividiamo i dati</h2>
        <p className="text-sm text-celeste-muted">
          Ci avvaliamo di alcuni fornitori di servizi che trattano i dati per nostro conto: Supabase
          (database, autenticazione e archiviazione di foto/documenti/audio), OpenAI (riassunti
          automatici, categorizzazione dei contenuti ed elaborazione del testo delle email per il
          rilevamento appuntamenti), Stripe (pagamenti), Google e Microsoft (solo se colleghi
          rispettivamente Gmail o Outlook), Resend (invio delle email di promemoria), Vercel (hosting
          dell&apos;applicazione e statistiche di utilizzo anonime e aggregate tramite Vercel
          Analytics) e OpenStreetMap (geocodifica e ricerca di luoghi vicini). Non condividiamo i tuoi
          dati con terzi per finalità di marketing.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Trasferimento dei dati fuori dallo Spazio Economico Europeo</h2>
        <p className="text-sm text-celeste-muted">
          Il database che conserva i tuoi dati (Supabase) è ospitato nell&apos;Unione Europea (Irlanda).
          L&apos;infrastruttura che elabora le richieste dell&apos;app (Vercel) opera invece da server
          negli Stati Uniti, e anche alcuni fornitori a cui ci affidiamo per servizi specifici — come
          OpenAI e Stripe — hanno sede negli Stati Uniti. Questo comporta un trasferimento dei tuoi dati
          personali al di fuori dello Spazio Economico Europeo (SEE). Adottiamo le clausole contrattuali
          standard e le altre misure previste dalla normativa applicabile per garantire un livello di
          protezione adeguato anche in questi trasferimenti. Per domande su una specifica garanzia
          adottata, scrivici a info@axistpl.hk.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Conservazione e cancellazione dei dati</h2>
        <p className="text-sm text-celeste-muted">
          Conserviamo i tuoi dati finché il tuo account resta attivo. Puoi eliminare singolarmente
          memorie, farmaci, appuntamenti, scadenze, spese, luoghi e sottoscrizioni push direttamente
          dall&apos;app. Per richiedere la cancellazione completa dell&apos;account e di tutti i dati
          associati, scrivi a info@axistpl.hk: provvederemo entro un tempo ragionevole, salvo obblighi
          di legge che richiedano una conservazione più lunga di specifici dati (ad esempio quelli di
          fatturazione).
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Sicurezza</h2>
        <p className="text-sm text-celeste-muted">
          Adottiamo misure tecniche e organizzative per proteggere i tuoi dati, tra cui regole di
          accesso a livello di database che limitano ogni utente ai propri soli dati e la cifratura dei
          token di accesso alle integrazioni Google/Microsoft. Nessun sistema è sicuro al 100%: ti
          invitiamo a usare una password solida e a non condividere le credenziali del tuo account.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">I tuoi diritti</h2>
        <p className="text-sm text-celeste-muted">
          Se ti trovi nello Spazio Economico Europeo hai diritto di accedere ai tuoi dati, chiederne la
          rettifica o la cancellazione, limitarne o opporti al trattamento, richiederne la portabilità e
          revocare in qualsiasi momento un consenso prestato, senza pregiudicare la liceità di quanto
          trattato prima della revoca. Puoi esercitare questi diritti scrivendo a info@axistpl.hk, oppure
          proporre reclamo al Garante per la Protezione dei Dati Personali (garanteprivacy.it) o
          all&apos;autorità di controllo del tuo Paese.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Una nota sui dati sanitari</h2>
        <p className="text-sm text-celeste-muted">
          Le funzioni relative a farmaci, ciclo mestruale e gravidanza sono facoltative e si attivano
          solo se le abiliti tu stesso. IMRECALL non è un dispositivo medico e non fornisce diagnosi,
          cure o consulenza medica: le informazioni salvate sono promemoria personali. Consulta sempre
          un professionista sanitario per qualsiasi decisione relativa alla tua salute.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Cookie</h2>
        <p className="text-sm text-celeste-muted">
          Usiamo cookie tecnici necessari al funzionamento del servizio, ad esempio per mantenere la
          sessione di accesso o per il collegamento sicuro con Gmail/Outlook durante l&apos;autenticazione.
          Per capire come viene usata l&apos;app usiamo inoltre{" "}
          <strong className="text-celeste-navy">Vercel Analytics</strong>, uno strumento di analisi del
          traffico che, per come lo abbiamo configurato, non utilizza cookie e non crea un profilo
          individuale della tua navigazione: raccoglie solo dati aggregati e anonimi (ad esempio pagine
          più visitate, paese di provenienza approssimativo, tipo di dispositivo), che non permettono di
          risalire alla tua identità. Non utilizziamo cookie di profilazione o di terze parti a scopo
          pubblicitario.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Età minima</h2>
        <p className="text-sm text-celeste-muted">
          IMRECALL è destinato a utenti che abbiano compiuto 18 anni. Non raccogliamo consapevolmente
          dati di minori di 18 anni.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Modifiche a questa informativa</h2>
        <p className="text-sm text-celeste-muted">
          Potremmo aggiornare periodicamente questa informativa. Pubblicheremo ogni modifica su questa
          pagina, aggiornando la data in cima.
        </p>
      </section>

      <section className="space-y-1 pt-2 border-t border-celeste-navy/10">
        <h2 className="font-medium">Contatti</h2>
        <p className="text-sm text-celeste-muted">Axis Trade Partners Limited</p>
        <p className="text-sm text-celeste-muted">
          Unit 903B, 9/F., Cameron Commercial Centre, 458-468 Hennessy Road, Causeway Bay, Hong Kong
        </p>
        <p className="text-sm text-celeste-muted">
          <a href="mailto:info@axistpl.hk" className="text-celeste-accentDark">
            info@axistpl.hk
          </a>
        </p>
      </section>
    </div>
  );
}
