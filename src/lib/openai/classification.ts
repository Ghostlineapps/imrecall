import OpenAI from "openai";
import { createServiceClient } from "@/lib/supabase/server";
import { generateEmbedding } from "./embeddings";
import { geocodePlace, reverseGeocodeBestName } from "@/lib/utils/geocoding";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const CLASSIFY_SYSTEM_PROMPT = `Sei il motore di classificazione di IMRECALL, un'app di memoria personale.
Analizza il testo dell'utente e rispondi SOLO con un oggetto JSON valido (nessun testo extra, nessun markdown), con questa struttura:

{
  "categories": ["persona" | "luogo" | "evento" | "idea" | "obiettivo"],  // 1-3 valori
  "tags": ["tag1", "tag2", ...],  // 3-7 tag brevi e descrittivi
  "ai_summary": "sintesi in una frase",
  "confidence": 0.0-1.0,
  "entities": [
    { "type": "person" | "place" | "organization" | "date" | "other", "name": "..." }
  ],
  "is_intention": true | false,  // true se il testo esprime un desiderio/proposito non ancora realizzato
                                   // es. "volevo andare a...", "devo tornare a...", "da provare quando..."
  "places": ["nome del luogo menzionato, se presente"]  // luoghi geografici citati esplicitamente
}

Regole:
- "is_intention" è true SOLO per desideri/propositi non completati, non per ricordi già vissuti.
- Estrai i luoghi con il nome più specifico e riconoscibile possibile (es. "Siviglia", non "una città").
- Se non ci sono entità o luoghi, restituisci array vuoti.`;

export async function classifyMemory(text: string) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: CLASSIFY_SYSTEM_PROMPT },
      { role: "user", content: text },
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
  });

  return JSON.parse(completion.choices[0].message.content ?? "{}");
}

/**
 * Pipeline completa di processing asincrono per una memoria appena creata:
 * 1. Embedding per la ricerca semantica / chat RAG
 * 2. Classificazione (categoria, tag, sintesi, confidence)
 * 3. NER: entità nominate (persone, luoghi, organizzazioni)
 * 4. Rilevamento intenzione ("volevo andare a...") — cuore del resurfacing
 * 5. Geocoding dei luoghi menzionati, per il matching di prossimità
 *
 * Retry: fino a 3 tentativi con backoff esponenziale, poi status='error'.
 */
export async function processMemory(memoryId: string, attempt = 1) {
  const supabase = createServiceClient();

  try {
    const { data: memory } = await supabase
      .from("memories")
      .select("*")
      .eq("id", memoryId)
      .single();

    if (!memory) return;

    // Il titolo (es. il nome del file per un documento caricato: "Digital_
    // Voucher_SerialNo-...pdf") va incluso nel testo indicizzato, non solo
    // mostrato in UI — altrimenti una ricerca con parole prese dal nome del
    // file ("digital voucher") non trova nulla se quelle parole non
    // compaiono anche nel testo estratto/generato. Per foto e voce il
    // titolo è quasi sempre vuoto, quindi qui non cambia nulla. Ripuliamo il
    // nome file solo per l'embedding (non per il titolo mostrato in UI):
    // "Digital_Voucher_SerialNo-123.pdf" → "Digital Voucher SerialNo 123" —
    // parole separate si allineano meglio a una query in linguaggio naturale.
    const baseText = memory.content || memory.raw_content || memory.link_description || "";
    const titleForEmbedding = memory.title
      ?.replace(/\.[a-zA-Z0-9]{2,5}$/, "")
      .replace(/[_-]+/g, " ")
      .trim();
    const textToProcess = titleForEmbedding ? `${titleForEmbedding}\n\n${baseText}`.trim() : baseText;
    if (!textToProcess) {
      await supabase.from("memories").update({ status: "ready" }).eq("id", memoryId);
      return;
    }

    const [embedding, classification] = await Promise.all([
      generateEmbedding(textToProcess),
      classifyMemory(textToProcess),
    ]);

    await supabase
      .from("memories")
      .update({
        status: "ready",
        embedding,
        categories: classification.categories ?? [],
        tags: classification.tags ?? [],
        ai_summary: classification.ai_summary ?? null,
        ai_confidence: classification.confidence ?? null,
        is_intention: classification.is_intention ?? false,
        intention_status: classification.is_intention ? "pending" : null,
      })
      .eq("id", memoryId);

    // Salva le entità (persone, organizzazioni, date) e collega alla memoria
    for (const entity of classification.entities ?? []) {
      if (entity.type === "place") continue; // i luoghi vanno in `places`, non `entities`
      const normalized = entity.name.toLowerCase().trim();

      const { data: entityRow } = await supabase
        .from("entities")
        .upsert(
          { user_id: memory.user_id, type: entity.type, name: entity.name, normalized_name: normalized },
          { onConflict: "user_id,normalized_name,type", ignoreDuplicates: false }
        )
        .select()
        .single();

      if (entityRow) {
        await supabase
          .from("memory_entities")
          .upsert({ memory_id: memoryId, entity_id: entityRow.id });
      }
    }

    // Geocodifica i luoghi menzionati nel testo — abilita il resurfacing di
    // prossimità basato su "un luogo di cui hai scritto/parlato". Ha senso
    // per testo/audio (l'utente descrive un posto in cui È STATO), ma NON
    // per documento/riunione/link: un indirizzo stampato su un referto o
    // una fattura è quasi sempre quello di chi ha EMESSO il documento (es.
    // il laboratorio analisi), non un posto che l'utente ha visitato; una
    // riunione può avere un indirizzo senza che l'utente ci sia stato di
    // persona (call, sede altrui); un link salvato (es. un articolo su un
    // ristorante) non implica esserci mai andato. Collegare comunque questi
    // tre tipi a un luogo alimentava nearby_memories() con "sei tornato
    // qui" del tutto slegati dalla posizione reale dell'utente — segnalato
    // 2026-09-03: un referto di analisi cliniche ha fatto scattare "sei
    // tornato a Terlizzi (BA)" solo perché il laboratorio ha sede lì,
    // l'utente non c'era mai stato né al momento del caricamento né prima.
    // Le foto restano collegate via GPS reale dello scatto
    // (geocodeAndLinkPlaceByCoords, chiamata altrove), non toccate da
    // questo filtro.
    const TYPES_WITHOUT_TEXT_PLACE_LINKING = new Set(["document", "meeting", "link"]);
    if (!TYPES_WITHOUT_TEXT_PLACE_LINKING.has(memory.type)) {
      for (const placeName of classification.places ?? []) {
        await geocodeAndLinkPlace(supabase, memory.user_id, memoryId, placeName);
      }
    }
  } catch (err) {
    if (attempt < 3) {
      const delayMs = 1000 * 2 ** attempt; // backoff esponenziale
      await new Promise((r) => setTimeout(r, delayMs));
      return processMemory(memoryId, attempt + 1);
    }

    await supabase
      .from("memories")
      .update({
        status: "error",
        error_message: err instanceof Error ? err.message : "unknown_error",
        processing_attempts: attempt,
      })
      .eq("id", memoryId);
  }
}

async function geocodeAndLinkPlace(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  memoryId: string,
  placeName: string
) {
  const normalized = placeName.toLowerCase().trim();

  let { data: place } = await supabase
    .from("places")
    .select("*")
    .eq("user_id", userId)
    .eq("normalized_name", normalized)
    .single();

  if (!place) {
    const geo = await geocodePlace(placeName);
    const { data: newPlace } = await supabase
      .from("places")
      .insert({
        user_id: userId,
        name: placeName,
        normalized_name: normalized,
        latitude: geo?.latitude ?? null,
        longitude: geo?.longitude ?? null,
        granularity: geo?.granularity ?? "city",
        geocoded_at: geo ? new Date().toISOString() : null,
      })
      .select()
      .single();
    place = newPlace;
  }

  if (place) {
    await supabase.from("memory_places").upsert({ memory_id: memoryId, place_id: place.id });
  }
}

/**
 * Collega una memoria a un luogo a partire da coordinate GPS reali (es. EXIF
 * di una foto o posizione del dispositivo al momento dello scatto), invece
 * che dal nome menzionato nel testo. È questo il collegamento che rende
 * possibile il caso d'uso originale del prodotto: fotografo un ristorante,
 * l'app registra dove; mesi dopo, tornando lì vicino, nearby_memories()
 * (vedi migrazione 012) può risalire a quella foto e riproporla.
 *
 * Dedup per normalized_name come in geocodeAndLinkPlace: se il reverse
 * geocoding restituisce lo stesso indirizzo breve di un luogo già salvato,
 * riusa quella riga invece di crearne una nuova identica.
 */
export async function geocodeAndLinkPlaceByCoords(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  memoryId: string,
  latitude: number,
  longitude: number
) {
  // reverseGeocodeBestName invece del solo reverseGeocode: preferisce il
  // nome del locale/monumento quando le coordinate corrispondono a un punto
  // d'interesse riconoscibile (vedi il commento su reverseGeocodeBestName
  // in lib/utils/geocoding.ts — fix 2026-09-06).
  const placeName = await reverseGeocodeBestName(latitude, longitude);
  if (!placeName) return;

  const normalized = placeName.toLowerCase().trim();

  let { data: place } = await supabase
    .from("places")
    .select("*")
    .eq("user_id", userId)
    .eq("normalized_name", normalized)
    .single();

  if (!place) {
    const { data: newPlace } = await supabase
      .from("places")
      .insert({
        user_id: userId,
        name: placeName,
        normalized_name: normalized,
        latitude,
        longitude,
        granularity: "poi", // coordinate dirette dal dispositivo, non un nome geocodificato
        geocoded_at: new Date().toISOString(),
      })
      .select()
      .single();
    place = newPlace;
  }

  if (place) {
    await supabase.from("memory_places").upsert({ memory_id: memoryId, place_id: place.id });
  }
}
