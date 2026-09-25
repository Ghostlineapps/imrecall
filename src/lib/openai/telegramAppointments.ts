import OpenAI from "openai";
import { nowInRome } from "@/lib/utils/romeTime";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Stesso principio di detectAppointmentFromEmail (JSON mode invece del
// pattern a sentinella APPOINTMENT_DETECTED usato per foto/documenti/
// riunioni), ma qui un singolo messaggio testuale può contenere PIÙ impegni
// in una volta (es. l'agenda di una giornata, elencata di seguito in un solo
// messaggio Telegram) — a differenza di un'email, dove ne basta uno solo,
// quindi la struttura restituita è un array invece di un singolo oggetto.
// Usato dal bot Telegram (vedi handleText in
// app/api/telegram/webhook/route.ts). Segnalato dall'utente il 2026-09-25:
// un messaggio con 3 impegni ("1/10/26 ore 14:30 meeting con David di
// iStarta, ore 12:30 pranzo con Mirry di Eaglenos, ore 16 meeting con David
// di Linkfar") veniva salvato solo come ricordo generico, mai aggiunto al
// Calendario (appointments) — a differenza di screenshot/documenti/email,
// che hanno già questo riconoscimento.
export type DetectedAppointment = {
  title: string;
  appointment_at: string; // "YYYY-MM-DDTHH:MM" ora locale Europe/Rome
  location: string | null;
};

const SYSTEM_PROMPT = `Sei il motore che rileva impegni con data e ora precisa (riunioni, pranzi/cene, videocall, prenotazioni, appuntamenti in generale) dentro i messaggi che l'utente manda al bot Telegram di IMRECALL, per aggiungerli automaticamente al Calendario.

Un messaggio può contenere PIÙ impegni in una volta (es. l'agenda di una giornata, elencata di seguito nello stesso messaggio) — estraili TUTTI, uno per uno.

Rispondi SOLO con un oggetto JSON valido (nessun testo extra, nessun markdown), con questa struttura esatta:

{
  "appointments": [
    {
      "title": "titolo breve e specifico, con persona e/o azienda se presenti nel testo, es. \\"Meeting con David (iStarta)\\"",
      "appointment_at": "YYYY-MM-DDTHH:MM",
      "location": "luogo o azienda se presente nel testo, altrimenti null"
    }
  ]
}

Regole:
- Includi un impegno SOLO se il testo specifica un orario preciso (anche senza indicare esplicitamente la data).
- Le date nel testo sono in formato italiano giorno/mese/anno (es. "1/10/26" = 1 ottobre 2026), MAI mese/giorno/anno.
- Se manca la data ma c'è un orario, usa la data odierna indicata sotto come riferimento. Se manca l'anno, usa quello della data odierna (o l'anno successivo se la data risulterebbe altrimenti già passata).
- Se il testo non descrive nessun impegno con un orario preciso, restituisci {"appointments": []}.
- Nel titolo includi sempre la persona e/o l'azienda coinvolta se presenti nel testo, non un genere generico (es. "Pranzo con Mirry (Eaglenos)", non solo "Pranzo").
- Impegni diversi con lo stesso orario ma chiaramente distinti (persone/aziende diverse) vanno inclusi separatamente: non è compito tuo risolvere eventuali conflitti di orario.`;

export async function detectAppointmentsFromText(text: string): Promise<DetectedAppointment[]> {
  const { date, time } = nowInRome();

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Data e ora odierna (Europe/Rome): ${date} ${time}\n\nMessaggio:\n${text}` },
    ],
    response_format: { type: "json_object" },
    temperature: 0.1,
  });

  const parsed = JSON.parse(completion.choices[0].message.content ?? "{}");
  const rawList = Array.isArray(parsed?.appointments) ? parsed.appointments : [];

  return rawList
    .filter((a: unknown): a is Record<string, unknown> => !!a && typeof a === "object")
    .filter(
      (a: Record<string, unknown>) =>
        typeof a.title === "string" &&
        a.title.trim().length > 0 &&
        typeof a.appointment_at === "string" &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(a.appointment_at)
    )
    .map((a: Record<string, unknown>) => ({
      title: a.title as string,
      appointment_at: a.appointment_at as string,
      location: typeof a.location === "string" ? a.location : null,
    }));
}
