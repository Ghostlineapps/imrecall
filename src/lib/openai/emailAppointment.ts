import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Stesso principio del rilevamento APPOINTMENT_DETECTED già usato per foto,
// documenti e riunioni (vedi src/app/api/upload/*), applicato qui al testo
// di un'email invece che a un'immagine o una trascrizione. A differenza di
// quei casi (dove l'appuntamento è un "di più" opzionale dentro una
// risposta più ampia), qui è l'UNICO scopo della chiamata: usiamo il JSON
// mode di OpenAI invece del pattern a sentinella testuale (LABEL: {...}),
// più robusto quando non c'è altro testo di contorno da preservare.
export type EmailAppointmentResult = {
  is_appointment: boolean;
  title: string | null;
  appointment_at: string | null; // "YYYY-MM-DDTHH:MM" ora locale Europe/Rome
  duration_minutes: number | null;
  location: string | null; // indirizzo fisico, oppure il link della videocall se non c'è un luogo fisico
};

const SYSTEM_PROMPT = `Sei il motore che rileva riunioni, videocall e prenotazioni dentro le email di un utente, per l'app di memoria personale IMRECALL.

Ti verrà passato il testo di UNA email (oggetto, mittente, data di invio, corpo). Rispondi SOLO con un oggetto JSON valido (nessun testo extra, nessun markdown), con questa struttura esatta:

{
  "is_appointment": true | false,
  "title": "titolo breve e specifico, es. \\"Call con Marco - revisione contratto\\", oppure null",
  "appointment_at": "YYYY-MM-DDTHH:MM oppure null",
  "duration_minutes": numero di minuti (default 60 se non specificato), oppure null se is_appointment è false,
  "location": "indirizzo fisico se c'è, altrimenti il link della videocall (Zoom/Meet/Teams/...) se presente, altrimenti null"
}

Regole:
- "is_appointment" è true SOLO se l'email propone o conferma un impegno con data E ORA precisa nel FUTURO
  rispetto alla data di invio dell'email: una riunione, una videocall, una prenotazione (ristorante, visita,
  appuntamento in generale), un invito a un evento con orario.
- NON è un appuntamento: newsletter, promozioni, notifiche generiche, conferme d'ordine senza orario fisso,
  fatture, ricevute, email puramente informative, richieste di riprogrammare senza una nuova data proposta.
- Se l'email menziona un orario relativo ("domani alle 15", "martedì prossimo"), calcola la data assoluta
  usando la data di invio dell'email come riferimento per "oggi".
- Se manca l'orario ma la data è chiara, usa "09:00".
- Se "is_appointment" è false, tutti gli altri campi devono essere null.`;

export async function detectAppointmentFromEmail(email: {
  subject: string;
  from: string;
  dateHeader: string;
  bodyText: string;
}): Promise<EmailAppointmentResult> {
  const userContent = `Data invio: ${email.dateHeader}
Mittente: ${email.from}
Oggetto: ${email.subject}

Corpo:
${email.bodyText}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
    response_format: { type: "json_object" },
    temperature: 0.1,
  });

  const parsed = JSON.parse(completion.choices[0].message.content ?? "{}");

  const validDate =
    typeof parsed?.appointment_at === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(parsed.appointment_at);

  if (!parsed?.is_appointment || !parsed?.title || !validDate) {
    return { is_appointment: false, title: null, appointment_at: null, duration_minutes: null, location: null };
  }

  return {
    is_appointment: true,
    title: parsed.title,
    appointment_at: parsed.appointment_at,
    duration_minutes: typeof parsed.duration_minutes === "number" ? parsed.duration_minutes : 60,
    location: parsed.location ?? null,
  };
}
