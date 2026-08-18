# IMRECALL — backlog (idee/fix rimandati, non ancora implementati)

Aggiornato: 2026-08-18

## Interessi/preferenze — aggiungere "Fitness"
Aggiungere una categoria "Fitness & palestre" tra gli interessi del profilo,
così i consigli nei paraggi (NearbyForYou) suggeriscono palestre quando si
arriva in un posto nuovo, non solo cibo/arte/natura/ecc.

Modifiche puntuali già individuate (non ancora fatte):
- `src/lib/constants/preferences.ts` → aggiungere a `INTEREST_OPTIONS`:
  `{ value: "fitness", label: "Fitness & palestre" }`
- `src/app/api/places/nearby/route.ts` → aggiungere a `INTEREST_TAG_MAP`:
  `fitness: 'node["leisure"~"^(fitness_centre|sports_centre)$"](around:R,LAT,LON);',`

Nessuna migrazione DB necessaria: la colonna preferenze è già testo/array libero
sui valori di `INTEREST_OPTIONS`.

## Bug/UX rimandati
- [FATTO 2026-08-18] Ricerca "dove ero": l'ora è ora opzionale (se vuota,
  si usa mezzogiorno come ancora). Fallback reverse geocoding ora scala a
  città → regione → paese invece di arrendersi. Deployato in produzione.

## Feature non ancora iniziate (concettuali)
- Ricerca vera con risultati cliccabili (riusando `match_memories()` + UI
  stile `MemoryCard`), al posto della sola risposta testuale in chat.
- Sistema abbonamenti: prezzo di listino 99€/anno, prezzo "Founder a vita"
  49€/anno per i primi ~300 iscritti (numero esatto da confermare), prova
  gratuita 30 giorni, programma referral ("invita 4 amici → anno gratis"),
  possibilità di regalare abbonamenti premium a persone specifiche (~10
  amici/famiglia). Nessun codice/schema/Stripe ancora.
- Pubblicazione su App Store / Play Store (richiederebbe wrapping della PWA,
  probabilmente via Capacitor, più integrazione StoreKit/Play Billing per
  gli abbonamenti).
- Integrazioni con altre app (punto di partenza realistico: Google
  Calendar/Gmail).

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
- Presenza social (Instagram) per costruire audience prima del lancio
  pubblico — in discussione.
