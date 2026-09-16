import Link from "next/link";

export const metadata = {
  title: "Termini di Servizio — IMRECALL",
};

// Pagina pubblica (fuori dal gruppo di rotte (app)): raggiungibile senza
// login, come la privacy policy in src/app/privacy — stesso tema celeste e
// stessa struttura a sezioni per coerenza visiva. Contenuto redatto sulla
// base delle funzionalità e dei piani (Free/Premium mensile-annuale/Founder,
// vedi src/lib/stripe/client.ts) effettivamente presenti nel codice al
// 2026-09-16 — va rivisto da un legale prima della pubblicazione sul Play
// Store, in particolare per la clausola sulla legge applicabile/foro
// competente (Titolare con sede a Hong Kong, utenti prevalentemente UE) e
// per il diritto di recesso dei consumatori UE sugli abbonamenti digitali.
export default function TermsPage() {
  return (
    <div className="bg-celeste-bg min-h-full px-4 pt-6 pb-10 space-y-8 text-celeste-navy">
      <div>
        <Link href="/settings" className="text-celeste-muted text-sm">
          ← Impostazioni
        </Link>
      </div>

      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Termini di Servizio</h1>
        <p className="text-xs text-celeste-muted">Ultimo aggiornamento: 16 settembre 2026</p>
      </div>

      <section className="space-y-2">
        <h2 className="font-medium">Chi siamo e accettazione dei termini</h2>
        <p className="text-sm text-celeste-muted">
          IMRECALL è un servizio fornito da{" "}
          <strong className="text-celeste-navy">Axis Trade Partners Limited</strong>, con sede in Unit
          903B, 9/F., Cameron Commercial Centre, 458-468 Hennessy Road, Causeway Bay, Hong Kong
          (&quot;noi&quot;, &quot;IMRECALL&quot;). Creando un account o usando l&apos;app accetti questi
          Termini di Servizio e l&apos;
          <Link href="/privacy" className="text-celeste-accentDark">
            Informativa sulla Privacy
          </Link>
          , che ne fa parte integrante. Se non li accetti, ti chiediamo di non usare il servizio.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Il servizio</h2>
        <p className="text-sm text-celeste-muted">
          IMRECALL è un&apos;app personale per catturare e ritrovare ricordi, appuntamenti e
          informazioni utili della vita quotidiana: foto, documenti, note vocali, promemoria di
          scadenze e, se lo desideri, funzioni facoltative come il tracciamento di farmaci, ciclo
          mestruale, gravidanza e posizione. Alcune funzioni si basano su intelligenza artificiale
          di terze parti per generare riassunti, categorizzazioni e rilevamenti automatici: i
          risultati possono contenere imprecisioni e vanno sempre verificati da te prima di farvi
          affidamento per decisioni importanti.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Account e requisiti per l&apos;uso</h2>
        <p className="text-sm text-celeste-muted">
          Per usare IMRECALL devi avere almeno 18 anni e fornire un indirizzo email valido. Sei
          responsabile della riservatezza delle tue credenziali di accesso e di tutte le attività
          svolte tramite il tuo account. Contattaci subito a{" "}
          <a href="mailto:info@axistpl.hk" className="text-celeste-accentDark">
            info@axistpl.hk
          </a>{" "}
          se sospetti un accesso non autorizzato. Le informazioni che ci fornisci (email, nome)
          devono essere accurate: puoi aggiornarle in qualsiasi momento dalle Impostazioni.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Piani, prezzi e pagamenti</h2>
        <p className="text-sm text-celeste-muted">
          <strong className="text-celeste-navy">Free:</strong> accesso gratuito con limiti mensili
          su memorie salvate, minuti di trascrizione e documenti caricati, indicati in Impostazioni
          → Piano attuale.
        </p>
        <p className="text-sm text-celeste-muted">
          <strong className="text-celeste-navy">Premium (mensile o annuale):</strong> abbonamento a
          pagamento con limiti più ampi, addebitato in anticipo tramite Stripe, il nostro fornitore
          di pagamenti — non vediamo né conserviamo i dati della tua carta. L&apos;abbonamento si
          rinnova automaticamente alla scadenza di ogni periodo (mensile o annuale) allo stesso
          prezzo, salvo disdetta. Puoi disdire in qualsiasi momento dalle Impostazioni: la disdetta
          evita il rinnovo successivo, ma resta attiva fino alla fine del periodo già pagato. Non
          previsti rimborsi per periodi di fatturazione già iniziati, salvo quanto inderogabilmente
          previsto dalla legge applicabile nel tuo Paese di residenza (ad esempio il diritto di
          recesso entro 14 giorni per i consumatori nello Spazio Economico Europeo).
        </p>
        <p className="text-sm text-celeste-muted">
          <strong className="text-celeste-navy">Founder:</strong> pagamento unico che dà accesso
          Premium a vita, disponibile per un numero limitato di posti mostrato in Impostazioni →
          Piano attuale finché sono disponibili. Non essendo un abbonamento ricorrente, non prevede
          rinnovo né disdetta.
        </p>
        <p className="text-sm text-celeste-muted">
          Ci riserviamo il diritto di modificare prezzi e limiti dei piani per il futuro,
          comunicandolo con ragionevole anticipo; le modifiche non si applicano retroattivamente a
          un periodo già pagato.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">I tuoi contenuti</h2>
        <p className="text-sm text-celeste-muted">
          Tutto ciò che carichi o inserisci in IMRECALL — foto, documenti, audio, note, dati
          sanitari o di posizione — resta di tua proprietà. Ci concedi solo la licenza limitata,
          non esclusiva e revocabile necessaria per conservare, elaborare (anche tramite i
          fornitori di IA descritti nell&apos;Informativa sulla Privacy) e mostrarti questi
          contenuti al fine di fornirti il servizio. Sei l&apos;unico responsabile di ciò che
          carichi: assicurati di avere il diritto di farlo e di non violare diritti di terzi o
          leggi applicabili.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Uso consentito</h2>
        <p className="text-sm text-celeste-muted">
          Ti chiediamo di non usare IMRECALL per caricare contenuti illeciti, per violare diritti
          d&apos;autore o altri diritti di terzi, per tentare di accedere ad account o dati di
          altri utenti, per interferire con il funzionamento del servizio (ad esempio con attacchi
          automatizzati o tentativi di aggirare i limiti di piano) o per finalità diverse dall&apos;uso
          personale per cui l&apos;app è pensata. Ci riserviamo il diritto di sospendere o chiudere
          account che violano queste regole.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Una nota sui dati sanitari</h2>
        <p className="text-sm text-celeste-muted">
          Le funzioni relative a farmaci, ciclo mestruale e gravidanza sono facoltative, si
          attivano solo se le abiliti tu stesso e servono unicamente come promemoria personali.
          IMRECALL non è un dispositivo medico, non fornisce diagnosi, cure o consulenza medica e
          non va usato come sostituto del parere di un professionista sanitario. Consulta sempre un
          medico per qualsiasi decisione relativa alla tua salute.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Servizi e integrazioni di terze parti</h2>
        <p className="text-sm text-celeste-muted">
          Alcune funzioni si appoggiano a servizi di terze parti — tra cui OpenAI per
          l&apos;intelligenza artificiale, Stripe per i pagamenti e, se scegli di collegarli, Google
          o Microsoft per la lettura delle email. Il collegamento a Google/Microsoft è sempre
          facoltativo e revocabile dalle Impostazioni. Non siamo responsabili per interruzioni,
          errori o modifiche di questi servizi di terze parti al di fuori del nostro controllo.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Proprietà intellettuale di IMRECALL</h2>
        <p className="text-sm text-celeste-muted">
          Il software, il design, il marchio &quot;IMRECALL&quot; e ogni altro elemento del
          servizio non generato dai tuoi contenuti restano di proprietà di Axis Trade Partners
          Limited o dei rispettivi licenzianti. Non è consentito copiare, decompilare o
          ridistribuire l&apos;app al di fuori dell&apos;uso personale previsto da questi Termini.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Disponibilità del servizio</h2>
        <p className="text-sm text-celeste-muted">
          Lavoriamo per mantenere IMRECALL disponibile e affidabile, ma non garantiamo un servizio
          privo di interruzioni, errori o perdite di dati, specialmente durante manutenzioni o
          aggiornamenti. Ti consigliamo di non usare l&apos;app come unico backup di informazioni
          critiche. Possiamo aggiungere, modificare o rimuovere funzionalità nel tempo.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Limitazione di responsabilità</h2>
        <p className="text-sm text-celeste-muted">
          Nei limiti consentiti dalla legge applicabile, IMRECALL viene fornito &quot;così com&apos;è&quot;
          e non rispondiamo di danni indiretti, perdita di dati o di profitti derivanti dall&apos;uso
          o dall&apos;impossibilità di usare il servizio, incluse eventuali imprecisioni nei contenuti
          generati con intelligenza artificiale. Nulla in questi Termini esclude responsabilità che
          non possono essere escluse per legge, ad esempio per dolo o colpa grave.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Sospensione e cessazione dell&apos;account</h2>
        <p className="text-sm text-celeste-muted">
          Puoi chiudere il tuo account in qualsiasi momento scrivendo a{" "}
          <a href="mailto:info@axistpl.hk" className="text-celeste-accentDark">
            info@axistpl.hk
          </a>
          , come descritto nell&apos;Informativa sulla Privacy. Possiamo sospendere o chiudere un
          account che violi questi Termini o la legge applicabile, avvisandoti quando ragionevolmente
          possibile.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Legge applicabile</h2>
        <p className="text-sm text-celeste-muted">
          Questi Termini sono regolati dalla legge del luogo di residenza del Titolare, Hong Kong,
          fermo restando che se risiedi nello Spazio Economico Europeo continui a beneficiare delle
          norme inderogabili di tutela dei consumatori previste dalla legge del tuo Paese di
          residenza. Eventuali controversie saranno gestite cercando anzitutto una soluzione diretta
          scrivendo a{" "}
          <a href="mailto:info@axistpl.hk" className="text-celeste-accentDark">
            info@axistpl.hk
          </a>
          .
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Modifiche a questi Termini</h2>
        <p className="text-sm text-celeste-muted">
          Potremmo aggiornare periodicamente questi Termini. Pubblicheremo ogni modifica su questa
          pagina, aggiornando la data in cima; per modifiche sostanziali cercheremo di avvisarti
          anche in app. L&apos;uso continuato del servizio dopo una modifica implica l&apos;accettazione
          dei nuovi Termini.
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
