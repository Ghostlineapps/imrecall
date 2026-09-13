// Data e ora "a muro" in Europe/Rome, per farmaci/promemoria che devono
// ragionare in orario locale indipendentemente da dove gira il server
// (Vercel gira in UTC) — stessa esigenza già gestita ad hoc con
// romeLocalToUtcIso() nelle route di upload, ma qui serve la direzione
// opposta: "che ora è adesso, a Roma?" invece di convertire un orario dato.
export function nowInRome(): { date: string; time: string } {
const dtf = new Intl.DateTimeFormat("en-US", {
timeZone: "Europe/Rome",
year: "numeric",
month: "2-digit",
day: "2-digit",
hour: "2-digit",
minute: "2-digit",
hour12: false,
});

const parts = dtf.formatToParts(new Date()).reduce((acc: Record<string, string>, p) => {
if (p.type !== "literal") acc[p.type] = p.value;
return acc;
}, {});

// L'ora "24" a mezzanotte va normalizzata a "00" (comportamento noto di
// Intl con hour12: false), stessa accortezza già presa in
// romeOffsetMinutesAt() nelle route di upload.
const hour = parts.hour === "24" ? "00" : parts.hour;

return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${hour}:${parts.minute}` };
}

// Ora (numero 0-23) e giorno della settimana a Roma, per contenuti che
// cambiano nell'arco della giornata — es. il saluto e i promemoria in Home
// (vedi home/page.tsx). Prima quel calcolo usava new Date().getHours()/
// getDay() lato server: corretto solo se il server gira nel fuso di Roma,
// falso in produzione (Vercel gira in UTC) — bug segnalato il 2026-09-13
// (saluto "ancora buio" già di giorno, promemoria di pranzo alle 16, perché
// il server "pensava" fossero due ore prima). Stessa tecnica di nowInRome()
// sopra, con l'ora come numero (per i confronti >=/<) e il giorno come sigla
// inglese fissa (mon/tue/...) invece che come stringa data, per restare
// stabile indipendentemente dalla lingua dell'interfaccia — vedi
// weekly_reminders, migration 035.
const WEEKDAY_KEYS: Record<string, string> = {
Sun: "sun",
Mon: "mon",
Tue: "tue",
Wed: "wed",
Thu: "thu",
Fri: "fri",
Sat: "sat",
};

export function romeHourAndDayKey(): { hour: number; dayKey: string } {
const dtf = new Intl.DateTimeFormat("en-US", {
timeZone: "Europe/Rome",
hour: "2-digit",
hour12: false,
weekday: "short",
});

const parts = dtf.formatToParts(new Date()).reduce((acc: Record<string, string>, p) => {
if (p.type !== "literal") acc[p.type] = p.value;
return acc;
}, {});

// Stessa accortezza di nowInRome(): "24" a mezzanotte va letto come 0.
const hour = parts.hour === "24" ? 0 : Number(parts.hour);
const dayKey = WEEKDAY_KEYS[parts.weekday] ?? "sun";

return { hour, dayKey };
}
