// Logica di ricorrenza dei farmaci, condivisa fra /api/cron/medications
// (decide se inviare il promemoria push in questo minuto) e
// /api/medications/today (decide se mostrare il farmaco nella lista di
// oggi) — un'unica implementazione evita che le due route possano finire
// per disallinearsi silenziosamente su cosa vuol dire "dovuto oggi".
//
// Vedi la migrazione 019 per la spiegazione del modello di ricorrenza
// (daily / weekly / interval / monthly + start_date/end_date opzionali).

export interface MedicationRecurrence {
  recurrence_type: string | null;
  days_of_week: number[] | null;
  interval_days: number | null;
  interval_anchor_date: string | null;
  day_of_month: number | null;
  start_date: string | null;
  end_date: string | null;
}

// dateStr è sempre "YYYY-MM-DD" nel fuso Europe/Rome (vedi nowInRome()) —
// qui interessa solo la data di calendario, non l'ora, quindi va bene
// interpretarla come UTC pura: il giorno della settimana e la differenza
// in giorni fra due date di calendario non cambiano in base al fuso orario
// scelto per il confronto, a patto di essere coerenti.
function toUtcMidnight(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getTime();
}

export function medicationDueOn(med: MedicationRecurrence, dateStr: string): boolean {
  if (med.start_date && dateStr < med.start_date) return false;
  if (med.end_date && dateStr > med.end_date) return false;

  switch (med.recurrence_type) {
    case "weekly": {
      if (!med.days_of_week || med.days_of_week.length === 0) return true;
      const dayOfWeek = new Date(toUtcMidnight(dateStr)).getUTCDay(); // 0=domenica..6=sabato
      return med.days_of_week.includes(dayOfWeek);
    }
    case "interval": {
      if (!med.interval_days || med.interval_days < 1) return true;
      const anchor = med.interval_anchor_date ?? dateStr;
      const diffDays = Math.round((toUtcMidnight(dateStr) - toUtcMidnight(anchor)) / 86_400_000);
      return diffDays >= 0 && diffDays % med.interval_days === 0;
    }
    case "monthly": {
      if (!med.day_of_month) return true;
      const dayOfMonth = Number(dateStr.slice(8, 10));
      return dayOfMonth === med.day_of_month;
    }
    case "daily":
    default:
      return true;
  }
}
