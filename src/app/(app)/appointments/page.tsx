"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  format,
  isPast,
  isSameDay,
  isSameMonth,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  subMonths,
} from "date-fns";
import { it } from "date-fns/locale";
import { CheckCircle2, Plus, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import clsx from "clsx";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function AppointmentsPage() {
  const { data, isLoading, error, mutate } = useSWR("/api/appointments", fetcher);

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [saving, setSaving] = useState(false);

  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  // SWR non distingue "risposta vuota" da "richiesta fallita": se il
  // fetch va storto (rete, sessione scaduta...) mostriamo un errore
  // esplicito invece di far sembrare che semplicemente non ci sono
  // appuntamenti — capitava che sembrasse "sparito tutto" dopo un reload.
  const fetchFailed = !isLoading && (error || (data && data.error));

  const appointments = (data?.appointments ?? []).sort(
    (a: any, b: any) => new Date(a.appointment_at).getTime() - new Date(b.appointment_at).getTime()
  );

  const daysWithAppointments = useMemo(() => {
    const set = new Set<string>();
    for (const a of appointments) {
      set.add(format(new Date(a.appointment_at), "yyyy-MM-dd"));
    }
    return set;
  }, [appointments]);

  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [month]);

  const visibleAppointments = selectedDay
    ? appointments.filter((a: any) => isSameDay(new Date(a.appointment_at), selectedDay))
    : appointments;

  async function markComplete(id: string) {
    await fetch(`/api/appointments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: true }),
    });
    mutate();
  }

  async function remove(id: string) {
    await fetch(`/api/appointments/${id}`, { method: "DELETE" });
    mutate();
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!title || !date || !time) return;

    setSaving(true);
    try {
      await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          appointment_at: new Date(`${date}T${time}:00`).toISOString(),
          location: location || null,
        }),
      });
      setTitle("");
      setDate("");
      setTime("");
      setLocation("");
      setShowForm(false);
      mutate();
    } finally {
      setSaving(false);
    }
  }

  return (
    // Palette celeste (redesign 2026-08-21/25, seconda schermata convertita
    // dopo la Dashboard): stessa struttura di prima, solo colori.
    <div className="bg-celeste-bg min-h-full px-4 pt-6 pb-4 space-y-4 text-celeste-navy">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Calendario</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          aria-label="Aggiungi appuntamento"
          className="text-celeste-accentDark"
        >
          <Plus size={22} />
        </button>
      </div>

      <p className="text-celeste-muted text-sm">
        Fotografa una chat o un invito nella barra qui sotto — riconosciamo data e ora
        automaticamente. Puoi anche aggiungerne uno a mano con il tasto +.
      </p>

      {showForm && (
        <form onSubmit={handleAdd} className="card-light space-y-3">
          <input
            type="text"
            placeholder="Titolo (es. Cena con Marco)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input-field-light w-full"
          />
          <div className="flex gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="input-field-light flex-1"
            />
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="input-field-light flex-1"
            />
          </div>
          <input
            type="text"
            placeholder="Luogo (opzionale)"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="input-field-light w-full"
          />
          <button type="submit" disabled={saving} className="btn-primary-light w-full">
            {saving ? "Salvataggio…" : "Aggiungi appuntamento"}
          </button>
        </form>
      )}

      {/* Vista calendario mensile: un pallino sotto i giorni con almeno un
          appuntamento, tocca un giorno per filtrare la lista qui sotto. */}
      <div className="card-light space-y-3">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setMonth((m) => subMonths(m, 1))}
            aria-label="Mese precedente"
            className="text-celeste-muted hover:text-celeste-navy p-1"
          >
            <ChevronLeft size={18} />
          </button>
          <p className="font-medium capitalize">{format(month, "MMMM yyyy", { locale: it })}</p>
          <button
            onClick={() => setMonth((m) => addMonths(m, 1))}
            aria-label="Mese successivo"
            className="text-celeste-muted hover:text-celeste-navy p-1"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-y-1 text-center">
          {["L", "M", "M", "G", "V", "S", "D"].map((d, i) => (
            <span key={i} className="text-xs text-celeste-muted">
              {d}
            </span>
          ))}

          {calendarDays.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const hasAppointment = daysWithAppointments.has(key);
            const inMonth = isSameMonth(day, month);
            const selected = selectedDay && isSameDay(day, selectedDay);
            const today = isSameDay(day, new Date());

            return (
              <button
                key={key}
                onClick={() => setSelectedDay(selected ? null : day)}
                className={clsx(
                  "aspect-square rounded-full flex flex-col items-center justify-center text-sm transition-colors mx-auto w-8",
                  !inMonth && "text-celeste-navy/20",
                  inMonth && !selected && "text-celeste-navy/80 hover:bg-celeste-navy/5",
                  selected && "bg-gradient-to-br from-celeste-accent to-celeste-accentDark text-white",
                  !selected && today && "border border-celeste-accent/60"
                )}
              >
                {format(day, "d")}
                <span
                  className={clsx(
                    "w-1 h-1 rounded-full mt-0.5",
                    hasAppointment ? (selected ? "bg-white" : "bg-celeste-accent") : "bg-transparent"
                  )}
                />
              </button>
            );
          })}
        </div>

        {selectedDay && (
          <button onClick={() => setSelectedDay(null)} className="text-xs text-celeste-accentDark">
            Mostra tutti gli appuntamenti
          </button>
        )}
      </div>

      {isLoading && (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="card-light h-16 animate-pulse bg-celeste-navy/5" />
          ))}
        </div>
      )}

      {fetchFailed && (
        <p className="text-urgent text-sm px-1">
          Non sono riuscito a caricare gli appuntamenti. Controlla la connessione e ricarica la
          pagina.
        </p>
      )}

      {!isLoading && !fetchFailed && visibleAppointments.length === 0 && !showForm && (
        <p className="text-celeste-muted text-sm py-8 text-center">
          {selectedDay ? "Nessun appuntamento in questo giorno." : "Nessun appuntamento in programma."}
        </p>
      )}

      <div className="space-y-2">
        {visibleAppointments.map((a: any) => {
          const when = new Date(a.appointment_at);
          const overdue = isPast(when);

          return (
            <div key={a.id} className="card-light flex items-center gap-3">
              <button
                onClick={() => markComplete(a.id)}
                aria-label="Segna come fatto"
                className="text-celeste-navy/25 hover:text-green-600 transition-colors"
              >
                <CheckCircle2 size={22} />
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{a.title}</p>
                <p className="text-xs text-celeste-muted">
                  {format(when, "d MMMM yyyy · HH:mm", { locale: it })}
                  {a.location && ` · ${a.location}`}
                </p>
              </div>
              {overdue && (
                <span className="text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap bg-celeste-navy/5 text-celeste-muted">
                  passato
                </span>
              )}
              <button
                onClick={() => remove(a.id)}
                aria-label="Elimina appuntamento"
                className="text-celeste-navy/25 hover:text-urgent transition-colors"
              >
                <Trash2 size={18} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
