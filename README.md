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

### 4. Geocoding

Il resurfacing di prossimità usa Nominatim (OpenStreetMap) per geocodifica e
reverse geocoding — vedi `src/lib/utils/geocoding.ts`. Non serve nessuna API
key: funziona subito, rispettando il limite "leggero" di Nominatim (~1
richiesta al secondo).

### 5. Cron secret

Genera una stringa casuale per `CRON_SECRET` — protegge l'endpoint
`/api/cron/insights` (e `/api/admin/founder-welcome`). I job schedulati più
recenti (appuntamenti, promemoria di cattura giornaliera, sync Gmail/Outlook,
farmaci) usano invece un secret dedicato ciascuno — vedi `.env.example` e i
rispettivi file in `src/app/api/cron/`.

### 6. Avvia in locale

```bash
npm run dev
```

## Stato del progetto

Non più solo uno scaffold: l'app è live in produzione su `www.imrecall.app`
(Vercel), con autenticazione, upload/classificazione, resurfacing, piani a
pagamento (checkout e webhook Stripe implementati in `/api/checkout` e
`/api/webhooks/stripe`) e le integrazioni Google/Microsoft. Aree ancora da
verificare o completare, non coperte da questo README in dettaglio:
- **Export GDPR / cancellazione account**: la cancellazione va richiesta via
email (vedi `/privacy`); un export/cancellazione self-service in app non è
ancora implementato.
- **PWA offline queue**: `src/stores/` contiene lo scaffold per una coda di
cattura offline (Zustand) — verificare lo stato di implementazione prima di
farci affidamento.

## Nota sul resurfacing di prossimità su iOS

La vera geolocalizzazione in background non è disponibile per una PWA su iOS
(richiede iOS 16.4+, l'app aggiunta alla home, e comunque niente background
tracking come un'app nativa). L'implementazione attuale fa un check-in di
posizione all'apertura dell'app (`useLocationCheckin.ts`), che è la scelta
giusta per l'MVP: molto più semplice, e l'effetto "wow" per l'utente resta forte.
