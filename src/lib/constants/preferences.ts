// Elenco chiuso di opzioni per il profilo utente (dieta + interessi). Un
// set fisso, non testo libero, perché deve mappare 1:1 sui tag OpenStreetMap
// usati da /api/places/nearby per filtrare i luoghi vicini (vedi
// DIET_TAG_MAP / INTEREST_TAG_MAP in quel file) — testo libero non si
// potrebbe tradurre in query Overpass affidabili.

export const DIETARY_OPTIONS = [
  { value: "vegan", label: "Vegano" },
  { value: "vegetarian", label: "Vegetariano" },
  { value: "gluten_free", label: "Celiaco / senza glutine" },
  { value: "lactose_free", label: "Intollerante al lattosio" },
  { value: "halal", label: "Halal" },
  { value: "kosher", label: "Kosher" },
  { value: "pescetarian", label: "Pescetariano" },
] as const;

export const INTEREST_OPTIONS = [
  { value: "food", label: "Cibo & ristoranti" },
  { value: "art", label: "Arte & musei" },
  { value: "history", label: "Storia" },
  { value: "nature", label: "Natura & outdoor" },
  { value: "nightlife", label: "Vita notturna" },
  { value: "shopping", label: "Shopping" },
  { value: "cafes", label: "Caffè & pasticcerie" },
] as const;

export type DietaryPreference = (typeof DIETARY_OPTIONS)[number]["value"];
export type Interest = (typeof INTEREST_OPTIONS)[number]["value"];

export const DIETARY_VALUES: string[] = DIETARY_OPTIONS.map((o) => o.value);
export const INTEREST_VALUES: string[] = INTEREST_OPTIONS.map((o) => o.value);
