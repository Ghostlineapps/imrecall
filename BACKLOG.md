# IMRECALL — backlog (idee/fix rimandati, non ancora implementati)

Aggiornato: 2026-08-19

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
    Limiti durata per piano: 30 min free / 90 min premium (valori scelti da
    me in assenza di piani a pagamento reali, da rivedere quando ci sarà un
    vero sistema abbonamenti — vedi voce sopra). Limite file 24MB (sotto il
    tetto di 25MB di Whisper). `maxDuration = 60` per il piano Vercel
    Hobby, vista la trascrizione+riassunto potenzialmente lunghi.
  - Traduzione: non è stato costruito un output bilingue separato — GPT
    genera sempre titolo/riassunto in italiano indipendentemente dalla
    lingua parlata nella riunione, il che copre l'intento originale della
    richiesta ("+ traduzione") in modo implicito.
  - UI: nuovo componente `MeetingRecorder.tsx` (icona persone, timer
    HH:MM:SS per registrazioni lunghe, messaggi di errore dedicati per
    durata/dimensione superata), nuova tab "Riunione" nella capture sheet e
    pulsante dedicato nella CaptureBar, icona `Users` in MemoryCard e nuovo
    filtro "Riunioni" in TimelineFilters, player audio abilitato anche per
    il tipo "meeting" nella pagina di dettaglio memoria.
  - Deploy verificato su Vercel: build "Ready" in produzione per tutti e 5
    i commit (migrazione, route API, UI di cattura, UI timeline, player).
  - NON ancora testato dal vivo con una registrazione reale (richiede
    microfono reale, non verificabile da automazione browser) — da provare
    dall'utente tramite l'icona "persone" nella barra di cattura.
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
