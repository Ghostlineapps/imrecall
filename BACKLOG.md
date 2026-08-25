# IMRECALL — backlog (idee/fix rimandati, non ancora implementati)

Aggiornato: 2026-08-25

## [FATTO 2026-08-25] Avviso quando le notifiche push sono disattivate (bug farmaci)
Bug report utente: "Stamattina la notifica del farmaco non è arrivata." Causa,
confermata dall'utente: le notifiche push erano disattivate (interruttore
globale in Impostazioni → Notifiche, condiviso da tutte le notifiche
dell'app — non solo farmaci). Il sistema non segnalava mai da nessuna parte
quando questo capitava: `sendPushToUser()` fallisce in silenzio se non c'è
un abbonamento valido, e l'unico posto dove lo stato "attivo/disattivo" era
visibile era la pagina Impostazioni → Notifiche stessa, che nessuno apre per
caso.

Fix: `src/components/home/MedicationsTodayCard.tsx` ora controlla lo stato
dell'abbonamento push (`navigator.serviceWorker` + `PushManager` +
`Notification.permission`) e, se ci sono farmaci in programma oggi ma le
notifiche sono spente, mostra un avviso rosso cliccabile che porta dritto a
Impostazioni → Notifiche — visibile dove l'utente vede davvero "i farmaci di
oggi", non nascosto in un menu.

Non risolto (root cause di perché si erano disattivate in origine): non
confermato se disattivazione manuale dell'utente o revoca del permesso da
parte del browser/iOS (es. dopo un reinstall della PWA, analogo al bug già
risolto di `useLocationCheckin.ts` con sessionStorage). Se dovesse
riaccadere senza un'azione esplicita dell'utente, vale la pena indagare
quella pista.

## [FATTO 2026-08-25] Registrazione: mostra/nascondi password + login Google
Richiesta utente: ridurre il rischio di errori di digitazione della password
in fase di registrazione da smartphone, valutando anche login social
(Apple/Facebook) e autenticazione biometrica.

Implementato subito (basso rischio, nessuna credenziale esterna richiesta):
- `src/app/(auth)/login/page.tsx` e `src/app/(auth)/signup/page.tsx`: campo
  password con icona occhio (mostra/nascondi in chiaro), pattern standard.
- `src/app/(auth)/signup/page.tsx`: aggiunto anche il pulsante "Continua con
  Google" (Supabase OAuth), già presente solo nel login — nessuna nuova
  configurazione richiesta perché il provider Google è già attivo.

Non implementato, richiede lavoro dell'utente prima che io possa procedere:
- Apple/Facebook login: servono un account Apple Developer (a pagamento) e
  un'app Meta for Developers, con client ID/secret da inserire nelle
  impostazioni Auth di Supabase — inserire credenziali è un'azione che non
  posso eseguire, va fatta dall'utente. Una volta configurati i provider su
  Supabase, aggiungere i pulsanti in UI è immediato.
- Autenticazione biometrica (Face ID/Touch ID) in fase di login: richiede
  supporto WebAuthn/passkey, non presente oggi — scope più ampio, da
  valutare come iniziativa a sé.

## [FATTO 2026-08-21] Nei paraggi: link al sito del locale
Richiesta utente: "quando suggerisci posti in base alle preferenze, i posti
suggeriti dovrebbero avere la possibilità di essere cliccato per vederne il
sito web [...] ovviamente se hanno un sito".

- `src/app/api/places/nearby/route.ts`: i tag OSM `website`/
  `contact:website` sono già presenti in `el.tags` (la query Overpass usa
  `out center`, verbosità default "body" = tag completi — stessa ragione
  per cui `category` funziona già oggi), quindi non serve toccare la query,
  solo leggerli. Aggiunta `normalizeWebsite()`: prende il primo valore se
  ce ne sono più d'uno separati da `;` (capita per locali con più sedi/
  social) e forza lo schema a `https://` se mancante (spesso mappato come
  "www.locale.it" senza protocollo) — così il frontend può usare il campo
  come `href` diretto. Nuovo campo `website: string | null` in ogni
  elemento di `recommendations`.
- `src/components/home/NearbyForYou.tsx`: ogni card ora è un `<a
  target="_blank" rel="noopener noreferrer">` verso `r.website` quando
  presente (icona `ExternalLink` a indicarlo), altrimenti resta un `<div>`
  non cliccabile — niente link vuoti per i locali senza sito mappato su
  OSM, come richiesto esplicitamente.

Pubblicato in 2 commit separati (workflow di upload via GitHub web).
Non verificato con `tsc` in locale (npm install bloccato dal registro in
questa sessione, come da nota tecnica in fondo al file) — solo revisione
manuale del codice, confermata dalla build "Ready" su Vercel in
produzione (nessun errore TypeScript emerso in fase di build). Non
ancora testato dal vivo con un locale reale che abbia un sito mappato su
OSM: da controllare copertura reale del tag `website` (probabilmente
parziale, come già per i tag `diet:*`) e comportamento su locali con
sito ma senza schema/con più valori.

## [FATTO 2026-08-21] Richiesta posizione ad ogni apertura dell'app
Segnalato dall'utente: "ogni volta che apro l'app mi chiede sempre se
voglio condividere la posizione". Causa: `useLocationCheckin.ts` (montato
in `src/app/(app)/layout.tsx`, quindi ad ogni navigazione dentro l'app)
usava `sessionStorage` per non richiedere la posizione più di una volta a
sessione. Su iOS, un'app aggiunta alla Home è però una nuova sessione
della WebView ad ogni lancio — `sessionStorage` si azzera insieme ad
essa, quindi il check-in (e il relativo prompt) ripartiva da zero ogni
volta che l'utente apriva l'app dall'icona.

Fix: passato a `localStorage` con un cooldown esplicito di 6 ore (invece
di "una volta a sessione"), e il tentativo viene segnato sia in caso di
concessione che di rifiuto del permesso, per non rincorrere subito un
utente che ha appena detto no. Non è una soluzione completa: se iOS
stesso non ricorda il permesso già concesso tra un lancio e l'altro
dell'app installata (limite noto e documentato delle PWA "Aggiungi a
Home" su WebKit, fuori dal nostro controllo), il prompt di sistema può
ricomparire comunque — ma non più ad ogni apertura, al massimo ogni 6 ore.

## [FATTO 2026-08-21] Logo scelto: "Orbita nel Monogramma", icone rigenerate
Dopo l'artifact con le quattro proposte (Orbita, Eco, Scia, Monogramma) e su
richiesta dell'utente ("prova a mixarli"), sono stati proposti due mix.
L'utente ha scelto la direzione "monogramma" lasciando la decisione finale
a Claude tra le due varianti disponibili con quel nome: il concetto
originale 04 (lettere "IM") o il mix "Orbita nel Monogramma" (cerchio con
puntino di Orbita dentro la stessa piastrella sfumata). Scelto il mix:
stessa forma/contenitore già riconoscibile sul telefono, ma con il segno
davvero legato all'interfaccia (lo stesso cerchio+puntino del cerchio nella
Dashboard) invece di due lettere generiche — coerente con l'obiettivo
originale "identità", non solo "un'icona qualsiasi".

- `public/icon-192.png` e `public/icon-512.png` rigenerati via Python/Pillow
  (nessuna libreria npm: registro bloccato in questo ambiente, vedi nota
  tecnica in fondo) — piastrella piena con sfumatura `#4C7EA0` → `#375F7D`,
  cerchio+puntino bianchi al centro, piccolo puntino "in orbita" in alto a
  destra. Full-bleed, senza angoli arrotondati disegnati a mano: iOS/Android
  applicano la propria maschera, arrotondare anche noi avrebbe creato un
  doppio bordo visibile.
- `public/manifest.json`: `background_color` da `#0F0F11` (nero, vecchio
  tema) a `#EAF2F8` (celeste chiaro, lo sfondo reale della Dashboard) — è il
  colore mostrato durante lo splash screen d'avvio della PWA, ora coerente
  con la prima schermata vera. `theme_color` da `#0F0F11` a `#375F7D`
  (accent scuro), per una barra di stato/status bar iOS coerente col
  gradiente della nuova icona invece del nero del tema vecchio.
- `src/app/layout.tsx`: `viewport.themeColor` allineato allo stesso
  `#375F7D` (prima era ancora `#0F0F11` anche qui, doppia fonte della
  stessa incoerenza).

Non toccato: l'header della Dashboard resta solo testo "IMRECALL" — il
segno non è stato ancora aggiunto lì, non richiesto esplicitamente in
questo giro. Possibile prossimo passo se il logo convince anche lì.

## [FATTO 2026-08-21] Icona home-screen iOS: da placeholder generico a icona vera
L'utente ha segnalato "manca un logo identificativo", e ha poi mandato uno
screenshot della propria home iPhone: l'icona IMRECALL non era nemmeno il
vecchio monogramma "IM" presente in `public/icon-512.png` — era una "I"
bianca semplice su nero, identica al placeholder che iOS genera da solo
quando non trova un'icona dedicata (stesso pattern delle altre app senza
icona nello screenshot).

Causa: `src/app/layout.tsx` non aveva mai avuto un campo `metadata.icons`.
`public/manifest.json` aveva già le icone corrette per Android/Chrome, ma
iOS Safari non le legge da lì per "Aggiungi a Home" — gli serve un
`<link rel="apple-touch-icon">` esplicito, che solo `metadata.icons` genera
in Next.js. Aggiunto il campo, puntato alle icone esistenti
(`icon-192.png`, `icon-512.png`).

Questo fix collega correttamente il meccanismo, ma **non cambia da solo**
la scorciatoia già presente sul telefono dell'utente (va rimossa e
riaggiunta per vedere l'effetto), e le icone PNG a cui punta sono ancora
quelle vecchie (cerchio indaco, tema scuro) — da sostituire una volta
scelta la direzione del nuovo logo (vedi sezione "Logo" più sotto/artifact
condiviso con l'utente: Orbita, Eco, Scia, Monogramma). Una volta scelto,
serve anche aggiornare `background_color`/`theme_color` in
`manifest.json`, ancora `#0F0F11` (vecchio tema scuro).

## [FATTO 2026-08-21] Redesign Dashboard: benvenuto, profondità, coerenza cromatica
Richiesta dell'utente: "la pagina è totalmente piatta, troppo anonima e
senza identità". Il problema reale, visibile aprendo la Dashboard: il
redesign celeste del 19/08 aveva rifatto solo l'intestazione e il cerchio,
lasciando le card sotto (Oggi, Farmaci, Nei paraggi, Spostamenti) sul vecchio
tema scuro — due linguaggi visivi incollati, non un errore di stile ma di
coerenza. Confermato con l'utente lo scope prima di partire (via
AskUserQuestion): si parte dalla sola Dashboard, si estende al resto
dell'app solo se il risultato convince.

- **Blocco di benvenuto**: le due righe piatte "Ciao / Dashboard" diventano
  un blocco a piena larghezza con la palette del brand (sfumatura
  celeste-accent → celeste-accentDark), due bagliori sfocati per dare
  profondità invece di un colore piatto, saluto legato all'ora del giorno
  (Buongiorno/Buon pomeriggio/Buonasera + nome) e la tagline del prodotto
  ("La tua memoria, sempre con te"). La ricerca ora galleggia dentro questo
  blocco invece che sotto, su sfondo piatto.
- **Coerenza cromatica**: le quattro card sotto il cerchio (TodayCard,
  MedicationsTodayCard, NearbyForYou, LocationStatusCard) sono passate dalla
  `.card` scura condivisa con il resto dell'app a una nuova `.card-light`
  (in globals.css) pensata per le schermate già in palette celeste — testo,
  bordi e icone ricoloriti di conseguenza. `.card` originale intoccata:
  tutte le altre schermate (ancora scure) non sono state toccate.
- **Profondità nel cerchio**: bagliore sfumato dietro al cerchio dei
  pulsanti (prima "galleggiava" su sfondo piatto), gradiente vero sui
  pulsanti (prima quasi invisibile, stesso colore a due opacità), micro
  interazione hover/tap.
- **Pulsante di cattura duplicato**: scoperto in corso d'opera — il
  pulsante fluttuante "+" (presente su ogni schermata) e il "+" al centro
  del cerchio facevano *la stessa identica azione* a pochi centimetri di
  distanza sulla Dashboard, uno dei motivi per cui la pagina sembrava
  confusa. Il pulsante fluttuante ora si nasconde solo su `/home`, dov'è
  ridondante; resta invariato su tutte le altre schermate.
- StreakBadge (il badge fiamma dello streak) ridisegnato per stare sul
  nuovo sfondo sfumato invece che su sfondo chiaro/bianco (bianco
  traslucido invece di `bg-warn/10`, altrimenti sarebbe sparito).

Verificato dal vivo in produzione (screenshot prima/dopo): intestazione,
ricerca, cerchio e tutte e quattro le card sotto ora nella stessa palette
chiara, nessun più salto visivo scendendo lungo la pagina. Il resto
dell'app (Chat, Ricordi, Calendario, Scadenze, Spese, Salute, dettaglio
ricordo) resta deliberatamente sul tema scuro per ora — l'estensione è
già discussa con l'utente come possibile prossimo passo, non ancora
decisa.

## [FATTO 2026-08-21] Esportazione nota spese in PDF, con foto degli scontrini
Richiesta dell'utente subito dopo la sezione Spese: poter esportare tutto su
un "foglio Excel" da stampare/condividere/scaricare, foto degli scontrini
incluse. Chiarito con l'utente (via domanda rapida) che il formato voluto era
un PDF stampabile con le foto, non un Excel di soli dati — e che il periodo
va scelto al momento dell'esportazione, non fissato.

Non generiamo il PDF sul server: niente libreria PDF aggiunta (avrebbe
richiesto `npm install`, non eseguibile in questo ambiente perché il
registro npm è bloccato — vedi nota tecnica in fondo). La nota spese è
invece una pagina web dedicata, pensata per la stampa
(`/expenses/export?from=...&to=...`, nuovo gruppo di route `(print)` senza
BottomNav/FAB): il pulsante "Stampa / Salva come PDF" apre la finestra di
stampa del browser, dove "Salva come PDF" produce un vero file PDF — stesso
risultato, senza dipendenze nuove. Funziona anche per stampare su carta o
condividere la pagina.

Contenuto della nota: intestazione con nome e periodo, totale e riepilogo
per categoria, tabella di dettaglio di tutte le spese nel periodo, e infine
le foto di tutti gli scontrini fotografati (link firmati generati al volo,
brevi, non quelli scaduti salvati al momento del caricamento).

Il pulsante "Esporta" (icona, accanto a "Aggiungi spesa" in /expenses) apre
un pannello per scegliere il periodo: mese corrente, un mese specifico, o un
intervallo di date libero.

Verificato end-to-end in produzione: creata una spesa di test, generata la
nota per il mese corrente dal pulsante Esporta, verificato che la pagina
mostri correttamente intestazione/totale/categoria/tabella con i dati
corretti, poi spesa di test cancellata. La lettura delle foto scontrino in
PDF non è stata testata con un vero scontrino fotografato (richiederebbe
un'immagine reale), ma riusa lo stesso URL firmato già in uso altrove
nell'app.

**Nota tecnica**: in questa sessione l'accesso al registro npm è bloccato
(errore 403 su qualunque pacchetto, non solo quelli per il PDF) e il
repository ha un `package-lock.json` committato — installare una libreria
nuova avrebbe richiesto rigenerare il lockfile senza poterlo verificare.
Da qui la scelta di stampa-da-browser invece di una libreria PDF lato
server: zero dipendenze nuove, stesso risultato per l'utente.

## [FATTO 2026-08-21] Sezione Spese: nota spese da scontrini + budget mensile
Richiesta dell'utente ("andiamo avanti con budget e nota spese?"), già
annunciata come "prossimamente" nel post Instagram del 20/08. Stesso schema
architetturale della sezione Salute (migrazione 020): nuovo pulsante
dedicato sul cerchio della Dashboard, non una nuova categorizzazione dei
ricordi.

**Nota spese**: nuova tabella `expenses` (migrazione 022) con importo,
negozio, categoria e data. Due modi per aggiungere una spesa:
- Foto dello scontrino: la stessa Vision già usata per scadenze e
  appuntamenti (`/api/upload/image`) ora riconosce anche gli scontrini
  (`RECEIPT_DETECTED`) e crea la spesa in automatico — funziona da
  qualunque foto caricata, non solo dalla sezione Spese, come già succede
  per scadenze/appuntamenti. L'utente aveva chiesto esplicitamente
  "esecuzione automatica con possibilità di modifica in caso di errata
  lettura": ogni spesa (letta da foto o inserita a mano) si tocca dalla
  lista per aprire una scheda di modifica (negozio, importo, categoria,
  data) o eliminarla.
- Inserimento manuale: nuovo tab "Spesa" nella cattura, per chi non ha lo
  scontrino a portata di mano.

**Budget**: un limite mensile totale opzionale (colonna `monthly_budget` su
`profiles`), impostabile dalla sezione Spese. Barra di avanzamento con
avviso quando ci si avvicina (≥80%) o si supera (100%) la soglia. Scelto un
budget totale singolo e non per categoria per restare semplice in questa
prima versione — nessuna richiesta esplicita dell'utente su questo punto,
scelta fatta per bilanciare completezza e tempo di implementazione.

Verificato end-to-end in produzione: creata una spesa di test a mano,
verificato il totale mensile e la barra budget (incluso lo stato "superato"
con soglia bassa apposta), corretta e infine cancellata dalla scheda di
modifica — tutto tramite l'app live, non solo query dirette sul database.
Verificato anche il nuovo pulsante "Spese" sul cerchio della Dashboard.

## [FATTO 2026-08-20] Cancellare un farmaco (via ricordo) ora ferma davvero le notifiche
Bug segnalato dall'utente: aveva ricancellato dei farmaci già presenti,
ricreandoli, ma quelli vecchi hanno continuato a generare notifiche di
assunzione anche dopo la cancellazione ("stamattina ho avuto due notifiche").

Causa confermata in produzione: l'unico modo che l'utente ha per "cancellare
un farmaco" è cancellare il ricordo che lo rappresenta, tramite
`soft_delete_memory()` (RPC introdotta nella migrazione 018). Quella funzione
marca `deleted_at` sulla riga in `memories`, ma non tocca in alcun modo la
riga collegata in `medications` — che restava `active = true` e continuava a
essere considerata dal cron `/api/cron/medications`. Non esiste, in nessun
punto della UI, un'azione che chiami `DELETE /api/medications/[id]`
direttamente (verificato via grep su `MedicationSchedule.tsx`,
`MedicationsTodayCard.tsx`, `MedicationCapture.tsx`).

Confermato via query diretta in produzione: esattamente 2 farmaci erano
rimasti "fantasma" (`active = true` con il ricordo collegato già cancellato
la sera del 19/08) — "Bivis" (08:00) e "Ezetataros" (19:30), le due
notifiche ricevute quella mattina.

Fix (migrazione 021): `soft_delete_memory()` ora, nella stessa funzione
SECURITY DEFINER, disattiva (`active = false`) qualunque riga di
`medications` collegata al ricordo appena cancellato (`memory_id = p_id`).
Scelto "disattiva" e non "cancella la riga farmaco": stesso pattern
soft-delete già usato per i ricordi, mantiene lo storico/dose per eventuale
consultazione futura senza generare più promemoria.

Applicato subito in produzione: ricreata la funzione con il fix, e disattivati
manualmente con una query una tantum i 2 farmaci fantasma già esistenti
(Bivis ed Ezetataros) — verificato `active = false` su entrambi dopo il fix,
niente più notifiche per loro da domani.

Nota: la correzione retroattiva è stata su misura per questi 2 farmaci
specifici (un'unica UPDATE mirata sui loro id); da qui in avanti ogni nuova
cancellazione di un ricordo-farmaco disattiva automaticamente il farmaco
collegato, grazie al fix nella funzione.

## [FATTO 2026-08-20] Consigli nei paraggi: match anche su "cuisine", non solo "diet"
L'utente (che abita in campagna, dove i tag `diet:*` di OpenStreetMap sono
rari) ha chiesto se impostando "Vegano" nel profilo sarebbero comparsi
ristoranti vegani/con alternative vegane — confermato di sì in linea di
principio, ma con un limite reale di copertura: `/api/places/nearby`
cercava solo il tag `diet:vegan=yes|only`, presente su OSM solo dove
qualcuno l'ha mappato esplicitamente. Richiesta esplicita: allargare la
ricerca "per tutte le categorie".

Fix: `DIET_TAG_MAP` in `src/app/api/places/nearby/route.ts` ora unisce
(OR, non AND) due clausole Overpass per ogni dieta — il tag `diet:X`
dedicato E il tag `cuisine` (più diffuso su OSM per locali specializzati,
es. `cuisine=vegan`). Applicato a vegano, vegetariano, senza glutine,
halal, kosher. Lasciati SOLO sul tag `diet:*` intollerante al lattosio e
pescetariano, perché OSM non ha un valore `cuisine` equivalente
riconosciuto per questi due — aggiungerne uno inventato avrebbe prodotto
falsi positivi, non più risultati veri.

Chiarito anche via domanda diretta dell'utente: se non si seleziona
nessuna dieta, il filtro dietetico non si applica affatto (nessun tag
"onnivoro" esiste su OSM) — si vede la lista generale di ristoranti/locali
in base agli interessi impostati (o cibo+caffè di default se il profilo è
vuoto), non una categoria "onnivori" a sé.

Verificato TypeScript (mirror + `tsc --noEmit --strict`, nessun nuovo
errore — nota: il comando di verifica standalone richiede `--lib
esnext,dom` per non generare un falso positivo su `.replaceAll()`, già
usato nel file prima di questa modifica; il `tsconfig.json` del progetto
ha già `lib: ["dom","dom.iterable","esnext"]`, quindi nessun problema
reale in build). Pubblicato in un commit, build "Ready" su Vercel con
badge "Production".

## [FATTO 2026-08-19] Fix definitivo cancellazione ricordi (RLS) + ricorrenza farmaci flessibile + UX cattura farmaco + sezione Salute
Tre richieste dell'utente nello stesso giro: (1) i due ricordi di test
("Bivis" e "Bivis test 2", vedi bug minore segnalato nella voce "Reminder
farmaci" sopra) risultavano ancora visibili nonostante il tentativo di
cancellazione — bug reale, non solo residuo di test vecchi; (2) supporto a
farmaci con cadenza settimanale, a giorni alterni o mensile (casi reali
citati: insulina settimanale per diabetici, vitamina D mensile per
anziani); (3) UX di cattura farmaco poco chiara — obbligava a cliccare "+"
dopo aver impostato l'orario anche per un farmaco preso una sola volta al
giorno ("basta mettere l'ora e salvare").

**1. Cancellazione ricordi — causa reale trovata**

Il tentativo precedente (migrazione 018, solo `WITH CHECK` sulla policy
UPDATE) non bastava: riprovando la DELETE sui due ricordi di test, falliva
ancora con la stessa violazione RLS. Causa reale, isolata con una serie di
test empirici diretti nell'SQL Editor di Supabase (`begin; set local role
authenticated; set local request.jwt.claims = '...'; <test>; rollback;`,
variando una variabile alla volta): quando una tabella ha RLS attivo e una
policy applicabile a SELECT ha una clausola `USING` che referenzia una
colonna (qui, `deleted_at is null`), Postgres applica quella STESSA clausola
anche alla riga RISULTANTE di un UPDATE — in aggiunta a, e
indipendentemente da, qualsiasi `WITH CHECK` scritto sulla policy UPDATE
dedicata. Un soft-delete che cambia `deleted_at` da null a non-null viola
quindi SEMPRE la policy SELECT sulla riga risultante, a prescindere da come
sia scritto il `WITH CHECK` — a meno di non avere affatto una policy
SELECT che referenzia quella colonna.

Fix: la policy `memories_own` è stata ripristinata alla sua forma
originale (`for all using (auth.uid() = user_id and deleted_at is null)
with check (auth.uid() = user_id)`, invariata dalla migrazione 006/primo
tentativo) — il problema non era in quella policy. Il fix vero è una
funzione `SECURITY DEFINER` che bypassa RLS e reimplementa a mano il
controllo di proprietà:
```sql
create or replace function soft_delete_memory(p_id uuid) returns void
language plpgsql security definer set search_path = public as $body$
begin
  update memories set deleted_at = now()
  where id = p_id and user_id = auth.uid() and deleted_at is null;
end; $body$;
grant execute on function soft_delete_memory(uuid) to authenticated;
```
`src/app/api/memories/[id]/route.ts` (DELETE) ora chiama
`supabase.rpc("soft_delete_memory", { p_id: params.id })` invece di un
UPDATE diretto. Migrazione 018 riscritta per documentare la causa reale
(non solo il fix). Verificato dal vivo sui due ricordi di test rimasti
("Bivis", "Bivis test 2"): entrambe le DELETE hanno restituito `200
{"success":true}` e non compaiono più in Ricordi/Timeline.

**2. Ricorrenza farmaci flessibile**

Migrazione 019, nuove colonne su `medications`:
- `recurrence_type` (`daily` default/invariato, `weekly`, `interval`,
  `monthly`).
- `weekly`: `days_of_week int[]` (0=domenica..6=sabato, convenzione
  `Date.prototype.getDay()`) — un farmaco "una volta a settimana" è
  semplicemente un solo giorno spuntato.
- `interval`: `interval_days` + `interval_anchor_date` — scelto
  deliberatamente al posto di un selettore di giorni della settimana per
  rappresentare "giorni alterni", perché un giorno della settimana fisso
  non esprime una vera alternanza (slitta ogni settimana). `interval_days
  = 2` a partire da `interval_anchor_date` è la modellazione corretta.
- `monthly`: `day_of_month` (1-31; se il mese è più corto quel mese non
  scatta, non slitta al giorno più vicino — scelta per restare
  prevedibile).
- `start_date`/`end_date`, ortogonali al tipo di ricorrenza, per farmaci a
  ciclo limitato (es. un antibiotico preso ogni giorno ma solo per una
  settimana).

`src/lib/medications/recurrence.ts` (nuovo, condiviso): `medicationDueOn(med,
dateStr)` centralizza la logica di corrispondenza, usata da entrambi i
punti che decidono se un farmaco è dovuto in un giorno — `GET
/api/medications/today` (schermata "farmaci di oggi") e `GET
/api/cron/medications` (job pg_cron che invia le notifiche push) — così le
due viste non possono disallinearsi. `POST /api/medications` e `PATCH
/api/medications/[id]` validano e salvano i nuovi campi (helper
`parseRecurrence` condiviso via FormData/JSON a seconda della route).

**3. UX cattura farmaco**

`MedicationCapture.tsx` riscritto: il farmaco si salva ora con solo nome +
orario, senza dover cliccare "+" (che resta disponibile solo per chi
prende il farmaco più volte al giorno, con nota esplicita in UI). Aggiunto
un selettore "Ogni quanto" (Tutti i giorni / Giorni specifici / Ogni tot
giorni / Una volta al mese) con UI condizionale — chip dei giorni della
settimana, numero di giorni di intervallo, o giorno del mese a seconda
della scelta — e un toggle opzionale "Solo per un periodo limitato" che
mostra due campi data.

**4. Sezione Salute**

Non una nuova categorizzazione né una vista di ricerca alternativa (la
ricerca semantica continua a funzionare su tutti i ricordi come prima) —
solo un punto d'ingresso visibile per far capire che si possono caricare
referti (esami del sangue, visite specialistiche...) come foto o file,
oltre ai farmaci: senza un punto d'ingresso dedicato nessuno penserebbe di
farlo. Migrazione 020: `memories.is_health boolean default false` +
indice parziale `(user_id, is_health) where is_health = true`. Impostato a
`true` esplicitamente in due punti — sempre per i farmaci (`POST
/api/medications`, ogni farmaco è per natura "salute"), e per foto/
documenti solo quando caricati dal "+" della sezione Salute
(`CaptureSheet` in modalità `healthMode`, che passa `isHealth` a
`ImageCapture`/`DocumentCapture`, che a loro volta aggiungono
`is_health=true` al FormData verso `/api/upload/image` e
`/api/upload/document`). Deliberatamente NON derivato da `tags` (che
viene sovrascritto dalla classificazione asincrona di `processMemory()`) —
`is_health` è immune a quella pipeline, impostato una volta sola
all'inserimento.

Nuovo bottone "Salute" nel cerchio della Dashboard (6° destinazione,
icona `HeartPulse`), nuova pagina `src/app/(app)/health/page.tsx`: lista i
ricordi con `is_health=true` (`GET /api/memories?is_health=true`,
raggruppati per giorno, riusa `MemoryCard`) e un "+" limitato a Foto/File/
Farmaco (`CaptureSheet` con `allowedTabs`, nuovo prop opzionale che
nasconde le altre tab di cattura senza toccarne il comportamento).

**Verifica**

Migrazioni 019 e 020 applicate in produzione via SQL Editor (stesso
workflow delle precedenti: `begin;...commit;`, testo verificato con
screenshot zoomato prima di eseguire, colonne/indice confermati via
query su `information_schema`/`pg_indexes` dopo l'esecuzione). Verificato
TypeScript (mirror + `tsc --noEmit --strict`, nessun nuovo errore) su
tutti i file toccati prima del push. Pubblicato in 12 commit separati
(workflow di upload via GitHub web, senza CLI git in sandbox), build
"Ready" su Vercel per tutti, ultimo commit ("Add Salute page") verificato
in stato "Ready"/Production.

Testato dal vivo in produzione: creato un farmaco di prova ("Test Insulina
settimanale", ricorrenza settimanale, giorno "Lun") dalla pagina Salute —
salvato correttamente senza dover toccare il "+" per l'orario, comparso
nella lista Salute, e verificato via query diretta che
`recurrence_type='weekly'`, `days_of_week=[1]` e `is_health=true` fossero
tutti salvati come atteso. Farmaco di prova rimosso dal database dopo la
verifica. Non testato dal vivo con un caso reale `interval` (giorni
alterni) o `monthly` — la logica di `medicationDueOn()` copre entrambi i
casi ma senza un farmaco reale attivo per più giorni non è verificabile
in un singolo giro; da tenere d'occhio se emergono problemi con farmaci
reali impostati su quelle ricorrenze.

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
