# IMRECALL — backlog (idee/fix rimandati, non ancora implementati)

Aggiornato: 2026-08-19

## [FATTO 2026-08-19] Redesign: Dashboard a cerchio + pulsante di cattura fluttuante
Richiesta utente: l'app andava ridisegnata perché poco comprensibile — in
particolare il tasto "Home" non aveva un senso chiaro, e in Impostazioni
c'era roba non pertinente (Spostamenti). Prima di ridisegnare è stata fatta
una mappatura di sola lettura di BottomNav/Home/Impostazioni per non agire
su un ricordo impreciso dell'utente: la cosa fuori posto era davvero
"Spostamenti" (una funzione, non una preferenza), non gli
appuntamenti/scadenze come inizialmente sospettato dall'utente (quelli
hanno già tab dedicate).

Iterato prima come mockup statico (immagini, nessun codice reale) per
validare l'idea con l'utente — cerchio con le 5 destinazioni principali +
barra di ricerca sopra, proposta dall'utente stessa ("mettessimo in cerchio
tutti i vari tasti [...] la chiamiamo dashboard e sopra ci mettiamo la
barra di ricerca?") — poi il posizionamento del pulsante fluttuante di
cattura è stato affinato più volte sul mockup (centrato meglio, non troppo
in basso) prima di scrivere codice vero. Solo dopo l'ok esplicito
("ok andiamo") è stata fatta l'implementazione reale:

- `tailwind.config.ts`: aggiunta palette `celeste` (bg/accent/accentDark/
  navy/muted) come token AGGIUNTIVI, senza toccare la palette scura
  esistente — per ora solo Dashboard e pulsante di cattura usano il nuovo
  stile chiaro, il resto dell'app resta sul tema scuro attuale. Estensione
  del redesign a tutte le altre schermate è un passo successivo, non fatto
  in questo giro.
- `src/app/(app)/home/page.tsx`: da "Home" (una card "oggi" + poco altro) a
  "Dashboard" — saluto, titolo, barra di ricerca, cerchio di 5 pulsanti
  (`DashboardHub.tsx`) attorno a un pulsante centrale "+", poi sotto le
  stesse card di prima (oggi/nei paraggi/spostamenti — nessuna funzione
  rimossa, solo raggiungibile in modo più diretto).
- `src/components/home/DashboardHub.tsx` (nuovo): i 5 pulsanti del cerchio
  puntano esattamente alle stesse destinazioni della barra in basso
  (Ricordi/Chat/Calendario/Scadenze/Profilo→Impostazioni) — il cerchio è un
  accesso più immediato, non una IA parallela. La barra di navigazione in
  basso resta invariata (solo l'etichetta "Home"→"Dashboard" in
  `BottomNav.tsx`) per non rompere nulla, da valutare in futuro se
  semplificarla ora che esiste il cerchio.
- `src/components/home/DashboardSearchBar.tsx` (nuovo): cerca direttamente
  dalla Dashboard passando la query a `/timeline?q=...` — riusa il motore
  di ricerca semantica già esistente in Ricordi invece di duplicarlo.
  `SearchBar.tsx` e `timeline/page.tsx` estesi per accettare/precompilare
  la query da URL (con `useSearchParams` avvolto in `<Suspense>`, richiesto
  da Next.js per l'export statico, stesso pattern già usato in
  `(auth)/login/page.tsx`).
- Pulsante di cattura: la vecchia `CaptureBar.tsx` (barra full-width sempre
  agganciata in fondo, su ogni schermata) sostituita da `CaptureFab.tsx`, un
  pulsante **+** fluttuante sempre visibile (in `(app)/layout.tsx`), più
  discreto ma con lo stesso accesso immediato a tutte le modalità di
  cattura. Aggiunta anche una tab "Testo" alla capture sheet
  (`TextCapture.tsx`) che prima esisteva solo come input inline nella
  vecchia barra — nessuna funzione persa nel passaggio. `CaptureBar.tsx`
  non più usata da nessuna pagina, lasciata nel repo ma orfana (da rimuovere
  in un secondo momento se non serve più).
- `src/app/(app)/settings/page.tsx`: rimosso il link "Spostamenti" (restava
  duplicato — l'unico punto d'ingresso ora è la card in Dashboard, come già
  deciso in una sessione precedente). Impostazioni ora contiene solo vere
  impostazioni: piano, profilo/preferenze, notifiche, logout.
- Verificato TypeScript (mirror + tsc --noEmit) prima del push. Pubblicato
  in 9 commit separati (un commit per cartella, workflow di upload via
  GitHub web essendo senza CLI git in sandbox); un commit intermedio
  (`Add Dashboard ring hub...`) ha temporaneamente rotto la build su Vercel
  perché referenziava la tab "Testo" prima che venisse aggiunta al commit
  successivo — la build è tornata "Ready" con il commit successivo
  (`Add text capture tab...`) e tutti i commit successivi, quindi la
  produzione non è mai rimasta rotta più di ~2 minuti. Verificato dal vivo
  sull'app in produzione (loggato come Francesco): Dashboard, ricerca,
  pulsante fluttuante e sheet di cattura, e pagina Impostazioni decluttered
  — tutto funzionante.

Resta fuori scope per ora: estendere la palette celeste al resto delle
schermate (Chat/Ricordi/Calendario/Scadenze/dettaglio memoria restano sul
tema scuro attuale) — questione aperta da riprendere quando l'utente vuole
procedere oltre.

[Seguito 2026-08-19] La barra di navigazione in basso è stata affrontata
subito dopo, su domanda diretta dell'utente ("che senso ha mantenere la
barra di navigazione se abbiamo tutto nei tasti in cerchio?"): ridotta da 6
a 2 voci — Dashboard e Istruzioni — in `BottomNav.tsx`. Chat/Ricordi/
Calendario/Scadenze/Impostazioni restavano ridondanti col cerchio (già
raggiungibili da lì), ma un modo per tornare alla Dashboard da qualunque
altra schermata serviva comunque, visto che il cerchio vive solo lì.
Su proposta dell'utente, "Istruzioni" è diventata anche l'occasione per
una guida in-app: nuova pagina `src/app/(app)/guide/page.tsx`, contenuto
statico (nessun dato utente, nessuna migrazione), che riusa la guida
passo-passo già scritta per il post Instagram — stesso testo, adattato ai
nomi attuali dei pulsanti (Ricordi/Chat/Calendario/Scadenze/Profilo) e con
una sezione in più che spiega il cerchio stesso. Verificato TypeScript,
pubblicato in 3 commit, build "Ready" su Vercel, e controllato dal vivo in
produzione: barra a 2 voci e pagina Istruzioni entrambe funzionanti.

[Seguito 2026-08-19] Bug reale segnalato dall'utente (con due screenshot):
cercato il buono Lidl salvato in precedenza, cliccato "Apri file
originale" nel dettaglio del ricordo, ottenuto un errore Supabase Storage
`{"statusCode":"400","error":"InvalidJWT","message":"\"exp\" claim
timestamp check failed"}` invece del PDF.

Causa: le tre route di upload (`/api/upload/document`, `/api/upload/image`,
`/api/upload/meeting`) generano un signed URL UNA SOLA VOLTA al momento del
caricamento, con scadenza fissa di un'ora (`createSignedUrl(path, 60*60)`),
e lo salvano permanentemente in `memories.media_url`. Qualsiasi ricordo più
vecchio di un'ora ha quindi un `media_url` ormai scaduto — non solo per i
documenti ("Apri file originale"), ma per lo stesso motivo anche per
immagini e audio/riunioni nel dettaglio ricordo, anche se l'utente ha
segnalato solo il caso del documento.

Fix: `src/app/api/memories/[id]/route.ts` (GET) ora rigenera un signed URL
fresco ad ogni richiesta, invece di restituire quello salvato al momento
dell'upload — valido un'altra ora da quando il ricordo viene aperto,
qualunque sia la sua età. Non serve nessuna migrazione né toccare le route
di upload: la scrittura di `media_url` al momento dell'upload resta (ormai
innocua, viene sovrascritta in lettura), l'unica fonte di verità per il
client è quella rigenerata nella GET.

Verificato TypeScript (mirror + tsc --noEmit, nessun nuovo errore),
pubblicato in un commit ("Fix expired signed URL for Apri file
originale"), build "Ready" su Vercel con badge "Production". Controllato
dal vivo sul ricordo del buono Lidl in produzione: il link generato ora ha
`exp` un'ora nel futuro rispetto al momento dell'apertura (non più quello
di un'ora dopo l'upload), e aprendolo il PDF si apre correttamente nel
visualizzatore del browser — nessun errore InvalidJWT.

Nota per un giro successivo (non richiesto dall'utente, non ancora
sistemato): la route `/api/upload/audio` non imposta mai `media_url`
sull'insert per i ricordi di tipo `audio` semplice (a differenza di
`meeting`, che passa dalla stessa route ma con `media_url` valorizzato) —
quindi il player audio non compare mai per quel tipo, nemmeno appena
caricato. Il fix sopra risolve comunque il caso una volta che `media_path`
è presente, perché la GET ora deriva l'URL da lì; ma se `media_path` non
viene salvato correttamente per l'audio semplice, resta un bug a parte da
verificare.

[Seguito 2026-08-19] Secondo bug reale segnalato dall'utente sullo stesso
buono Lidl, stavolta in Scadenze: comparso con "tra 0gg" (scaduto oggi)
quando in realtà il buono è valido un anno intero a partire da oggi
(19/08/2026 → 19/08/2027).

Causa: il prompt che estrae `DEADLINE_DETECTED` (uguale, duplicato, in
`/api/upload/document`, `/api/upload/image`, `/api/upload/meeting`)
chiedeva al modello solo "trova la data di scadenza", senza distinguere
tra una data di INIZIO validità ("valido a partire dal 19 agosto 2026") e
la vera scadenza. Il testo del voucher diceva esplicitamente "valido per
un anno a partire dal 19 agosto 2026" — il modello ha preso la data di
inizio come `due_date`, invece di calcolare inizio+1 anno.

Fix: aggiunta a tutti e tre i prompt un'istruzione esplicita — `due_date`
deve essere la scadenza reale, mai una data di inizio; se il testo dà una
durata a partire da una data di inizio, il modello deve calcolare lui
stesso inizio+durata; se non c'è né una scadenza esplicita né una durata
calcolabile, deve omettere del tutto la riga DEADLINE_DETECTED invece di
inventare una data. Verificato TypeScript, pubblicato in 3 commit (uno per
route), build "Ready" su Vercel con badge "Production".

Corretto anche a mano, via l'endpoint PATCH autenticato dell'app (non SQL
diretto sul DB — stesso percorso che userebbe l'utente, solo automatizzato)
il record già sbagliato del buono Lidl: `due_date` da 2026-08-19 a
2027-08-19. Nota: quel record risultava già segnato come completato
(`completed: true`, timbro poco dopo lo screenshot dell'utente) — lasciato
com'era, non è stato toccato, da chiarire con l'utente se era intenzionale.

Questo fix vale solo per le NUOVE scadenze rilevate da ora in poi: scadenze
già estratte in modo simile prima di oggi (se ce ne sono altre con lo
stesso problema) non vengono corrette automaticamente — richiederebbe un
controllo caso per caso, non fatto in questo giro.

[Seguito 2026-08-19] L'utente ha segnalato che il buono Lidl era sparito
dall'elenco delle Scadenze attive ("si rimettilo comr da fare"): confermato
che il flag `completed: true` notato sopra non era intenzionale, e
ripristinato a `completed: false` con lo stesso endpoint PATCH autenticato.
Verificato dal vivo: "Buono spesa Lidl · 19 agosto 2027 · tra 364gg" di
nuovo visibile in Scadenze.

## [FATTO 2026-08-19] Reminder farmaci
Proposta dell'utente ("creare un tasto 'Salute' dove si possono conservare
i vari esami del sangue, visite specialistiche, e in quella sezione anche
il reminder per i farmaci") valutata così: esami del sangue/visite
specialistiche sono già coperti dalla cattura generica esistente (foto o
testo, ritrovabili in chat via ricerca semantica, stesso principio della
scheda palestra sopra) — nessun lavoro nuovo necessario lì. Il reminder
farmaci invece è genuinamente nuovo: serve un'ora precisa + una notifica
push che nomini il farmaco esatto, per non rischiare scambi di dose nei
pazienti anziani ("una notifica push dovrebbe dire: Prendi il Bivis. così
non si rischia di sbagliare farmaco"). Decisione dell'utente su dove
metterlo: "ci sta che mettiamo tutto su 'Ricordi', mantiene l'equilibrio
dell'app" — niente nuova voce di navigazione, il farmaco è un tipo di
ricordo in più (`medication`) accanto agli altri, stesso principio già
seguito per i documenti.

Vincolo tecnico: i Cron Job di Vercel sul piano Hobby girano al massimo una
volta al giorno con un margine di ±59 minuti (vedi
https://vercel.com/docs/cron-jobs/usage-and-pricing) — troppo impreciso
per un promemoria a un orario esatto, più volte al giorno. Alternative
valutate: upgrade a Vercel Pro (20$/mese) per cron precisi, oppure
`pg_cron`/`pg_net` di Supabase (gratuiti anche sul piano free, granularità
al minuto, dentro il database stesso). Scelta dell'utente, esplicita per
motivi economici: "se usi pg_cron, risparmio danaro che in questo momento
è mooooolto scarso" — pg_cron, non Vercel Pro.

Dose/quantità: su indicazione dell'utente, NON estratta dall'AI — è testo
libero scritto o dettato dall'utente stesso dalla prescrizione del medico
("15 gocce", "due compresse", "una supposta", "una siringa"), stesso
principio del nome del farmaco. Niente chiamata a GPT nel percorso di
salvataggio farmaco, a differenza di foto/documenti/riunioni.

Schema (migrazioni 016-017):
- `memory_type` esteso con il valore `medication`.
- `medications`: farmaco (nome, dose testo libero, array di orari `HH:MM`
  fuso Europe/Rome, `active`), collegato a `memories.id` (`on delete set
  null` — cancellare il ricordo non cancella il farmaco, per errore
  scoperto più sotto).
- `medication_logs`: una riga per farmaco+giorno+orario dovuto, con
  `taken_at` (quando l'utente conferma la dose) e `notified_at` (quando è
  partita la notifica, per non reinviarla due volte nello stesso minuto).

API: `POST/GET /api/medications` (creazione + lista), `PATCH/DELETE
/api/medications/[id]`, `POST /api/medications/[id]/take` (segna presa/non
presa, usato sia da Dashboard che dal dettaglio memoria), `GET
/api/medications/today` (stato del giorno, fonte dati condivisa — stessa
chiave cache SWR — tra i due punti in cui compare), `GET
/api/cron/medications` (chiamato da pg_cron ogni minuto: cerca farmaci il
cui orario coincide col minuto corrente in fuso Europe/Rome via
`nowInRome()`, invia la push col nome del farmaco nel titolo — "Prendi il
Bivis" — e il deep-link al ricordo, con dedup su `notified_at`).

UI: nuova tab "Farmaco" nella capture sheet (foto opzionale + nome + dose +
chip orari), card "Farmaci di oggi" in Dashboard, stessa vista nel
dettaglio del ricordo-farmaco (così chi tocca la notifica push può
confermare subito la dose senza dover tornare in Dashboard), icona e
filtro dedicati in Ricordi/Timeline.

Infrastruttura: `MEDICATION_CRON_SECRET` generato e salvato nelle
Environment Variables di Vercel; estensioni `pg_cron` e `pg_net` abilitate
sul progetto Supabase; job schedulato con
`cron.schedule('medication-reminders', '* * * * *', $$select
net.http_get(url := '.../api/cron/medications', headers :=
jsonb_build_object('Authorization', 'Bearer <secret>'))$$)`. Il comando SQL
con il secret incorporato non è stato eseguito dall'assistente (inserire
credenziali/token in un campo è un'azione non consentita) — eseguito
dall'utente stesso su indicazione, nell'SQL Editor di Supabase.

Bug scoperto e corretto in fase di verifica end-to-end: il middleware di
autenticazione (`src/middleware.ts`) intercettava TUTTE le richieste,
incluse quelle verso `/api/*`, e reindirizzava alla pagina HTML di
`/login` qualsiasi chiamata priva di cookie di sessione — comportamento
invisibile per le chiamate normali dell'app (fatte dal browser, sempre con
cookie), ma fatale per una chiamata server-to-server come quella di
pg_cron: il job risultava "succeeded" (nessun errore SQL) ma la richiesta
non arrivava mai al route handler, quindi nessun farmaco veniva controllato
e nessuna notifica partiva mai, in silenzio. Diagnosticato confrontando il
titolo HTML restituito (quello della landing page, non un JSON) e poi
confermato nei log Vercel (307 su ogni chiamata prima del fix, 200 dopo).
Fix: le route `/api/*` ora saltano il middleware — gestiscono già da sole
l'autenticazione con risposta JSON 401, come previsto in origine.

Verificato dal vivo: creato un farmaco di prova ("Bivis test 2", dose "15
gocce") con orario a 2 minuti da allora; alle 23:09 il job pg_cron ha
chiamato l'endpoint (status 200, confermato nei log Vercel), la riga in
`medication_logs` ha ricevuto `notified_at`, e la spunta "presa" ha
funzionato sia dal widget in Dashboard sia dal dettaglio del ricordo
(stessa cache, sincronizzati). Farmaci di prova rimossi dal database dopo
la verifica (record `medications` cancellati via l'endpoint DELETE
autenticato dell'app) per non lasciare promemoria fittizi attivi.

Bug minore scoperto ma non risolto in questo giro (fuori scope): la
cancellazione di un ricordo (`DELETE /api/memories/[id]`, soft-delete via
`deleted_at`) fallisce con una violazione della policy RLS — non
verificato se preesistente o specifico ai ricordi di tipo `medication`, da
indagare separatamente. Per questo motivo i due ricordi di test ("Bivis" e
"Bivis test 2") restano visibili in Ricordi/Timeline, senza più alcun
farmaco/promemoria collegato (righe `medications` già cancellate) — solo
testo residuo, cancellabili a mano dall'utente se vuole ripulire.

## [FATTO 2026-08-19] Interessi/preferenze — aggiunta "Fitness"
Aggiunta la categoria "Fitness & palestre" tra gli interessi del profilo,
così i consigli nei paraggi (NearbyForYou) suggeriscono palestre quando si
arriva in un posto nuovo, non solo cibo/arte/natura/ecc.

Modifiche fatte:
- `src/lib/constants/preferences.ts` → aggiunto a `INTEREST_OPTIONS`:
  `{ value: "fitness", label: "Fitness & palestre" }`
- `src/app/api/places/nearby/route.ts` → aggiunto a `INTEREST_TAG_MAP`:
  `fitness: 'node["leisure"~"^(fitness_centre|sports_centre)$"](around:R,LAT,LON);',`

Nessuna migrazione DB necessaria: la colonna preferenze è già testo/array libero
sui valori di `INTEREST_OPTIONS`. La UI in impostazioni profilo itera già
dinamicamente su `INTEREST_OPTIONS`, quindi la nuova pillola "Fitness &
palestre" appare in automatico. Pubblicato e deployato in produzione.

## Bug/UX rimandati
- [FATTO 2026-08-18] Ricerca "dove ero": l'ora è ora opzionale (se vuota,
  si usa mezzogiorno come ancora). Fallback reverse geocoding ora scala a
  città → regione → paese invece di arrendersi. Deployato in produzione.

## Feature non ancora iniziate (concettuali)
- [FATTO 2026-08-19] Ricerca vera con risultati cliccabili (riusando
  `match_memories()` + UI stile `MemoryCard`), al posto della sola risposta
  testuale in chat. Pubblicata, deployata e testata dal vivo dall'utente:
  cercando "scheda palestra" nella tab Ricordi escono i ricordi pertinenti
  come lista cliccabile (in questo caso anche l'intenzione aperta "Voglio
  visualizzare la scheda palestra di agosto", oltre alla foto trascritta),
  e cliccando si apre il dettaglio del ricordo come atteso.
- Sistema abbonamenti: prezzo di listino 99€/anno, prezzo "Founder a vita"
  49€/anno per i primi ~300 iscritti (numero esatto da confermare), prova
  gratuita 30 giorni, programma referral ("invita 4 amici → anno gratis"),
  possibilità di regalare abbonamenti premium a persone specifiche (~10
  amici/famiglia). Nessun codice/schema/Stripe ancora.
  - [Evoluzione 2026-08-18] Idea di struttura più articolata, non decisa:
    abbonamento "a moduli" — ogni funzione avanzata (es. nota spese) ha un
    prezzo a sé (es. 5€/mese) con una soglia gratuita anche per chi ha solo
    il piano base (es. 2 note spese/anno gratis se premium). In alternativa,
    tre livelli tutto incluso: Silver (base), Gold (premium), Platinum
    (tutti i moduli inclusi, illimitato). Da decidere quale dei due modelli
    (a moduli vs. a livelli) usare — non entrambi assieme, si sovrappongono.
- [FATTO 2026-08-19] Registrazione riunioni/call con trascrizione, riassunto
  e "esplosione" dei temi trattati. Chiesto all'utente quale dei due
  percorsi tecnici descritti sotto implementare: scelto (1) MVP cattura da
  microfono, NON (2) integrazione nativa Zoom/Teams/Meet (rimandata a fase
  2, non scoping iniziale). Chiesto anche se estendere il tipo "audio"
  esistente o crearne uno dedicato: scelto un nuovo tipo "meeting" dedicato.
  Implementazione:
  - Migrazione 015: nuovo valore enum `meeting` su `memory_type` (applicata
    sia via SQL Editor su produzione sia come file di migrazione).
  - Nessuna nuova migrazione di storage: le registrazioni riusano il bucket
    "audio" e le sue policy RLS esistenti (stesso schema di path
    `${user.id}/...`, nessuna distinzione per tipo di memoria).
  - `src/app/api/upload/meeting/route.ts`: upload su Storage "audio" →
    trascrizione Whisper (auto-rilevamento lingua, non forzato italiano) →
    GPT-4o-mini per titolo/riassunto/temi + rilevamento scadenze/
    appuntamenti (stessa convenzione DEADLINE_DETECTED/APPOINTMENT_DETECTED)
    → salvataggio memoria (tipo "meeting") + embedding via processMemory().
    Limiti durata per piano: 60 min free / 90 min premium (alzato da 30 a
    60 min su richiesta esplicita dell'utente il 19/08 — valori comunque
    scelti da me in assenza di piani a pagamento reali, da rivedere quando
    ci sarà un vero sistema abbonamenti — vedi voce sopra). Limite file
    24MB (sotto il tetto di 25MB di Whisper) — per starci davvero anche a
    60-90 minuti, `MeetingRecorder.tsx` ora forza un bitrate audio esplicito
    di 32kbps (senza specificarlo il default del browser può arrivare a
    ~128kbps, che avrebbe fatto sforare il limite ben prima dei 90 minuti
    già promessi al piano premium — bug latente corretto insieme
    all'innalzamento del limite free). `maxDuration = 60` per il piano
    Vercel Hobby, vista la trascrizione+riassunto potenzialmente lunghi.
  - Traduzione [aggiornato 19/08]: titolo/riassunto/temi/mappa mentale sono
    sempre in italiano indipendentemente dalla lingua parlata (GPT li
    genera così, indipendentemente dalla lingua originale). In un secondo
    momento, su richiesta esplicita dell'utente ("ovviamente è in grado di
    tradurre conversazioni... in italiano"), aggiunta anche la traduzione
    INTEGRALE della trascrizione: se la riunione non è in italiano, GPT
    genera anche una traduzione parola-per-parola dell'intero testo
    (etichetta TRASCRIZIONE_TRADOTTA nel prompt), mostrata nel dettaglio
    memoria insieme (non al posto) alla trascrizione originale — scelta
    esplicita dell'utente tra "sostituisci", "tieni entrambe" e "lascia
    com'è", ha scelto "tieni entrambe". Se la riunione è già in italiano
    questa sezione viene omessa (nessuna traduzione ridondante). Alzato
    `max_tokens` della chiamata GPT a 16000 per non troncare la traduzione
    integrale su riunioni lunghe.
  - Mappa mentale [aggiunto 19/08, su richiesta esplicita dell'utente dopo
    aver chiesto se il prodotto facesse "le mappe come Plaud Note"]: GPT
    genera anche una sezione MAPPA (argomenti/sotto-argomenti, max 2
    livelli), convertita lato server in sintassi mermaid "mindmap"
    (`buildMindMapMermaid` in route.ts) e salvata in
    `memories.metadata.mind_map` (riuso della colonna jsonb esistente,
    nessuna migrazione DB necessaria). Renderizzata lato client come
    diagramma SVG dal nuovo componente `MindMap.tsx` (import dinamico di
    "mermaid", mai lato server) nella pagina di dettaglio memoria, subito
    sotto il player audio. Se il rendering fallisce (sintassi imprevista)
    la card semplicemente non appare, senza rompere il resto della pagina.
    Aggiunta dipendenza `mermaid` a package.json (non ho potuto verificare
    l'installazione in locale — il registro npm non era raggiungibile in
    sandbox in quel momento — ma il build su Vercel l'ha risolta senza
    problemi).
  - UI: nuovo componente `MeetingRecorder.tsx` (icona persone, timer
    HH:MM:SS per registrazioni lunghe, messaggi di errore dedicati per
    durata/dimensione superata), nuova tab "Riunione" nella capture sheet e
    pulsante dedicato nella CaptureBar, icona `Users` in MemoryCard e nuovo
    filtro "Riunioni" in TimelineFilters, player audio abilitato anche per
    il tipo "meeting" nella pagina di dettaglio memoria.
  - Deploy verificato su Vercel: build "Ready" in produzione per tutti gli
    8 commit di questa feature (migrazione, route API, UI di cattura, UI
    timeline, player, dipendenza mermaid, mappa mentale, bitrate/durata,
    traduzione trascrizione integrale).
  - NON ancora testato dal vivo con una registrazione reale (richiede
    microfono reale, non verificabile da automazione browser) — da provare
    dall'utente tramite l'icona "persone" nella barra di cattura, incluse
    mappa mentale e traduzione su una call non in italiano.
  Restano fuori scope, come discusso: (2) integrazione nativa con bot che
  si unisce alla riunione o cattura audio di sistema/scheda browser — molto
  più solida (come Otter/Fireflies) ma richiede integrazioni/API separate
  per ogni piattaforma (developer app, OAuth, infrastruttura bot).
- Pubblicazione su App Store / Play Store (richiederebbe wrapping della PWA,
  probabilmente via Capacitor, più integrazione StoreKit/Play Billing per
  gli abbonamenti).
- Integrazioni con altre app (punto di partenza realistico: Google
  Calendar/Gmail).

## Nuova feature grossa: Nota spese / rimborsi (idea utente, non scoping definitivo)
Non un semplice budget di viaggio: un vero modulo nota spese, utile anche a
chi deve rendicontare spese per un rimborso (lavoro, trasferte). Fotografi
lo scontrino/fattura e:
- l'importo viene estratto automaticamente (serve un 3° tipo di rilevamento
  Vision oltre a DEADLINE_DETECTED/APPOINTMENT_DETECTED, es. EXPENSE_DETECTED
  con importo, valuta, esercente, data) e sommato in tempo reale al totale
  del foglio/budget di riferimento;
- possibilità di impostare un budget totale (es. 3.000€) e vedere quanto
  resta man mano che si fotografano gli scontrini;
- importi ed esercente devono essere MODIFICABILI a mano (gli scontrini
  spesso sono poco leggibili, l'OCR non è affidabile al 100%);
- output: un "modellino" di nota spese compilato, con elenco importi +
  immagini degli scontrini allegate — probabile export come PDF o Excel;
- le foto degli scontrini scattate dall'app dovrebbero poter essere salvate
  anche nel rullino, organizzate in una cartella per mese di riferimento.

Nota tecnica importante sull'ultimo punto: un'app web (PWA, come IMRECALL
oggi) NON può creare album/cartelle nel rullino del telefono in automatico
— è un limite di piattaforma (iOS/Android), non risolvibile lato codice.
Può solo aprire il foglio di condivisione nativo per salvare una foto alla
volta (un tap in più, vedi idea "salva anche nel rullino" già discussa).
L'organizzazione automatica per mese richiederebbe un'app nativa vera
(altro motivo per cui pubblicare su store, in futuro, avrebbe senso). Da
notare comunque che l'app Foto di iOS raggruppa già le foto per mese/anno
di scatto di suo, senza bisogno di cartelle create da un'app terza.

Scope stimato: DB nuovo (tabella spese/fogli spesa), estensione del prompt
Vision, UI di modifica manuale, generazione documento esportabile. È un
pezzo di lavoro vero, non una modifica veloce — da scopare per bene quando
si decide di affrontarla, non in coda al polish del prodotto core.

## [FATTO 2026-08-19] Bug chat scoperti da test reale
Testando "mi ricordi la scheda della palestra?" sono emersi due bug veri:
1. Lo streaming della chat mostrava il protocollo grezzo (`0:"token"...`)
   invece del testo — risolto riscrivendo `/api/chat/route.ts` per
   scrivere testo semplice nello stream, senza passare da
   OpenAIStream/StreamingTextResponse del pacchetto "ai".
2. La ricerca semantica non trovava la foto giusta con soglia 0.65 — la
   query era formulata diversamente dal contenuto della memoria. Soglia
   abbassata a 0.5.
Entrambi pubblicati e verificati in produzione con un secondo test reale:
la chat ora risponde con l'elenco corretto degli esercizi, citazioni
comprese. Questo conferma anche che il caso "foto di un documento →
ritrovabile in chat" (medico, ristorante, scheda palestra) funziona
davvero, non solo in teoria.

## [FATTO 2026-08-19] Bug: file caricato non trovato in ricerca
Segnalato dall'utente: caricato un PDF ("Digital_Voucher_SerialNo-...pdf"),
visibile in timeline, ma cercando "digital voucher" la ricerca non lo
trovava. Causa: il titolo/nome file non veniva incluso nel testo indicizzato
per l'embedding (`processMemory()` in `classification.ts`), solo mostrato in
UI — quindi le parole prese dal nome del file (naturali da usare in una
ricerca) non trovavano corrispondenza se non comparivano anche nel testo
estratto/generato. Foto e note vocali non sono quasi mai affette (raramente
hanno un titolo). Fix: il titolo ripulito (senza estensione, underscore/
trattini sostituiti da spazi) viene ora anteposto al testo embeddato.
Aggiunto anche un endpoint generico `/api/memories/[id]/reprocess` per
rielaborare retroattivamente memorie esistenti con la pipeline aggiornata
(riusabile per futuri fix alla pipeline di indicizzazione, non solo questo).
Pubblicato, deployato e verificato in produzione: il PDF esistente è stato
rielaborato con l'endpoint di reprocess e la ricerca "digital voucher" ora
lo trova correttamente.

## Idee minori 2026-08-18: reminder farmaci, scheda palestra
- Reminder farmaci: fotografi la confezione/prescrizione, l'app imposta un
  promemoria ricorrente (anche più volte al giorno) per l'assunzione. A
  differenza delle scadenze attuali (una data singola, es. bollo/assicurazione),
  qui serve tracciare assunzioni ricorrenti nella giornata + "l'hai preso
  oggi?" — è un 4° tipo di rilevamento Vision oltre a
  DEADLINE/APPOINTMENT_DETECTED, ma concettualmente vicino a quello che
  già esiste (deadlines ricorrenti). Presa in considerazione positiva:
  aggiunta ragionevole, non snatura il prodotto.
- Scheda/tracciamento allenamenti in palestra: chiarito dall'utente che
  NON intende un log interattivo (serie/ripetizioni/pesi/progressi — quello
  resta sconsigliato, vedi sopra), ma semplicemente: fotografare la scheda
  palestra o il piano alimentare cartacei, e poterli ritrovare chiedendo
  "mi ricordi la scheda della palestra?" / "mi apri il mio piano
  alimentare?". Questo caso d'uso è GIÀ coperto dalla pipeline esistente,
  stesso principio degli orari del medico: la foto viene trascritta
  integralmente dal prompt Vision generico, indicizzata, e recuperabile
  via ricerca semantica in chat. Nessun lavoro nuovo necessario — da
  verificare con un test reale come per l'esempio del medico/ristorante.

## Multilingua (deciso, non ora)
Tutte le app (ImRecall, SnapMacro, sito axistpl.hk) andranno rese
multilingua in futuro. Deciso di rimandare finché il prodotto core non è
"finito decentemente" — non aggiungere lingue prima.

## Item 4 della roadmap originale (volutamente per ultimo)
- Redesign visivo usando il dominio ImRecall.app e il branding Axis Trade
  Partner Limited. Nota utente: lo sfondo nero attuale non piace, preferenza
  per un azzurro "che rilassa" come base della nuova palette. Priorità
  esplicita: prima prodotto stabile/senza bug, poi estetica — non prima.
  - [FATTO parzialmente, 2026-08-19] Vedi voce dedicata in cima al file:
    Dashboard ridisegnata (cerchio + ricerca) e pulsante di cattura
    fluttuante, con la nuova palette celeste, in produzione. Il resto delle
    schermate (Chat/Ricordi/Calendario/Scadenze/dettaglio memoria) resta
    ancora sul tema scuro originale — estensione della palette a tutta
    l'app non ancora fatta, da riprendere quando l'utente vuole procedere.
- Landing page su ImRecall.app (in discussione: sezione Founder, waitlist).
  Nota: imrecall.app non è ancora collegato a nessun deploy, oggi punta a
  nulla — link funzionante attuale resta imrecall.vercel.app.
- [IN CORSO 2026-08-18] Presenza social (Instagram): account @imrecall.app
  creato, privato, foto profilo e bio impostate, primo post pronto (non
  ancora pubblicato). Suggerimenti "persone che conosci" da disattivare
  nelle impostazioni se si vuole restare sotto traccia più a lungo.

## [FATTO 2026-08-19] Caricamento file (PDF, Word, Excel, PowerPoint)
Richiesta utente: "ecco cosa manca, la possibilità di caricare PDF" seguita
da chiarimento "in realtà si dovrebbe poter caricare qualsiasi tipo di
file...... excel, word, powerpoint". Nuovo tipo di memoria "document",
pensato per essere estendibile senza altre modifiche allo schema.

Wave 1 — PDF, TXT, CSV, MD — [FATTO, deployato e verificato in produzione]
- Migrazione 013: nuovo valore enum `document` su `memory_type`.
- Migrazione 014: bucket Storage "documents" (privato) + policy RLS
  insert/select/delete per utente, stesso pattern di images/audio.
- `src/lib/documents/extractText.ts`: estrazione testo (pdf-parse per PDF,
  lettura diretta per txt/csv/md).
- `src/app/api/upload/document/route.ts`: upload su Storage → estrazione
  testo → descrizione GPT-4o-mini + rilevamento scadenze/appuntamenti
  (stessa convenzione DEADLINE_DETECTED/APPOINTMENT_DETECTED della foto) →
  salvataggio memoria + embedding via processMemory().
- UI: nuova tab "File" nella capture sheet (DocumentCapture.tsx), icona
  dedicata in MemoryCard e TimelineFilters, pulsante "Apri file originale"
  nella pagina di dettaglio memoria.
- Dipendenza `pdf-parse` aggiunta a package.json (con dichiarazione di tipo
  ambient manuale, il pacchetto non pubblica tipi propri).
- Deploy verificato su Vercel: build "Ready" in produzione.

Wave 2 — Word (.docx), Excel (.xlsx/.xls), PowerPoint (.pptx) — [FATTO, deployato e verificato in produzione]
- Estrazione testo: mammoth (Word), xlsx/SheetJS (Excel), jszip + parsing
  XML custom (PowerPoint, non c'è una libreria diretta altrettanto comoda).
- Stessa pipeline di Wave 1 a valle dell'estrazione testo, nessuna nuova
  logica di embedding/ricerca necessaria.
- extractText.ts esteso con i tre nuovi formati; xlsx e jszip pubblicano
  già le proprie dichiarazioni di tipo (a differenza di pdf-parse e
  mammoth, per cui è servita una dichiarazione ambient manuale).
  ACCEPTED/hint in DocumentCapture.tsx aggiornati per riflettere i formati
  supportati. Dipendenze aggiunte a package.json in un commit isolato,
  come da strategia di rollout incrementale — build su Vercel andata a
  buon fine al primo tentativo.
