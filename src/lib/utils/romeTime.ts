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
