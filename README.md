# IMRECALL — Personal Memory OS

MVP funzionante: cattura multi-formato (testo/audio/immagine/link), classificazione AI,
chat RAG sulle memorie, e il differenziatore chiave — **resurfacing intelligente**:
- "Accadde oggi" (temporale)
- Prossimità geografica ("sei di nuovo a Siviglia, volevi andare in quel ristorante")
- Pre-trip digest (prima di partire, riepilogo delle intenzioni aperte in quella città)
- Circle-back manuale ("ricordamelo tra 1 mese")
- Scadenze intelligenti (bollo/assicurazione/fiscale, con estrazione automatica da foto)

## Setup

### 1. Installa le dipendenze

```bash
npm install
```

### 2. Configura Supabase

1. Crea un progetto su [supabase.com](https://supabase.com)
2. Applica le migrazioni in ordine (dashboard SQL Editor, oppure via CLI):

```bash
npx supabase link --project-ref <tuo-project-ref>
npx supabase db push
```

Le migrazioni sono in `supabase/migrations/`, numerate ed eseguibili in sequenza:
- `001_extensions.sql` — estensioni Postgres e tipi enum
- `002_core_tables.sql` — profiles, memories, entities, chat
- `003_resurfacing_tables.sql` — places, deadlines, resurface_candidates, trips (il cuore della differenziazione)
- `004_indexes.sql`
- `005_functions.sql` — RPC `match_memories`, `nearby_intentions`, trigger streak/scadenze ricorrenti
- `006_rls.sql` — Row Level Security

3. Crea i bucket Storage: `audio`, `images`, `avatars` (privati, owner-only policy)
4. Copia URL e anon key in `.env.local` (vedi `.env.example`)
5. Abilita provider Google in Authentication → Providers (opzionale, per il login OAuth)

### 3. Configura OpenAI

Aggiungi `OPENAI_API_KEY` in `.env.local`. Modelli usati:
- `text-embedding-3-small` — ricerca semantica
- `gpt-4o-mini` — classificazione, tag, NER, rilevamento intenzioni
- `gpt-4o` — chat RAG, Vision (descrizione immagini + OCR + rilevamento scadenze)
- `whisper-1` — trascrizione audio

### 4. Geocoding (opzionale ma consigliato)

Per il resurfacing di prossimità serve un provider di geocoding. Il codice in
`src/lib/utils/geocoding.ts` è pronto per Mapbox — aggiungi `GEOCODING_API_KEY`.
Senza questa chiave, le memorie vengono comunque classificate ma i luoghi non
vengono geocodificati, quindi il resurfacing "sei di nuovo a X" non funziona
(sono comunque attivi: on-this-day, deadline, circle-back manuale).

### 5. Cron secret

Genera una stringa casuale per `CRON_SECRET` — protegge l'endpoint
`/api/cron/insights` che genera i candidati di resurfacing ogni notte.

### 6. Avvia in locale

```bash
npm run dev
```

## Cosa manca per andare in produzione (non incluso in questo scaffold)

- **Stripe**: le route `/api/stripe/*` sono nella struttura ma non ancora
  implementate — vanno aggiunte checkout, portal, e gestione webhook.
- **Export GDPR / cancellazione account**: previsti nel piano (Fase 9) ma non
  ancora implementati.
- **PWA offline queue**: la cattura offline con coda Zustand (`src/stores/`)
  è nella struttura ma va implementata — per ora la cattura richiede connessione.
- **Icone reali** per `public/manifest.json` (192px e 512px).
- **Deploy**: collega il repo a Vercel, imposta le env vars, punta il dominio
  `imrecall.app`.

## Nota sul resurfacing di prossimità su iOS

La vera geolocalizzazione in background non è disponibile per una PWA su iOS
(richiede iOS 16.4+, l'app aggiunta alla home, e comunque niente background
tracking come un'app nativa). L'implementazione attuale fa un check-in di
posizione all'apertura dell'app (`useLocationCheckin.ts`), che è la scelta
giusta per l'MVP: molto più semplice, e l'effetto "wow" per l'utente resta forte.
