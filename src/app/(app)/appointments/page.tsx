"use client";

import { useState } from "react";
import useSWR from "swr";
import { format, isPast } from "date-fns";
import { it } from "date-fns/locale";
import { CheckCircle2, Plus, Trash2 } from "lucide-react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function AppointmentsPage() {
  const { data, isLoading, mutate } = useSWR("/api/appointments", fetcher);

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [saving, setSaving] = useState(false);

  const appointments = (data?.appointments ?? []).sort(
    (a: any, b: any) => new Date(a.appointment_at).getTime() - new Date(b.appointment_at).getTime()
  );

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
    <div className="px-4 pt-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Appuntamenti</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          aria-label="Aggiungi appuntamento"
          className="text-primary-light"
        >
          <Plus size={22} />
        </button>
      </div>

      <p className="text-white/40 text-sm">
        Fotografa una chat o un invito nella barra qui sotto — riconosciamo data e ora
        automaticamente. Puoi anche aggiungerne uno a mano con il tasto +.
      </p>

      {showForm && (
        <form onSubmit={handleAdd} className="card space-y-3">
          <input
            type="text"
            placeholder="Titolo (es. Cena con Marco)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input-field w-full"
          />
          <div className="flex gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="input-field flex-1"
            />
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="input-field flex-1"
            />
          </div>
          <input
            type="text"
            placeholder="Luogo (opzionale)"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="input-field w-full"
          />
          <button type="submit" disabled={saving} className="btn-primary w-full">
            {saving ? "Salvataggio…" : "Aggiungi appuntamento"}
          </button>
        </form>
      )}

      {isLoading && (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="card h-16 animate-pulse bg-white/5" />
          ))}
        </div>
      )}

      {!isLoading && appointments.length === 0 && !showForm && (
        <p className="text-white/30 text-sm py-8 text-center">Nessun appuntamento in programma.</p>
      )}

      <div className="space-y-2">
        {appointments.map((a: any) => {
          const when = new Date(a.appointment_at);
          const overdue = isPast(when);

          return (
            <div key={a.id} className="card flex items-center gap-3">
              <button
                onClick={() => markComplete(a.id)}
                aria-label="Segna come fatto"
                className="text-white/20 hover:text-green-400 transition-colors"
              >
                <CheckCircle2 size={22} />
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{a.title}</p>
                <p className="text-xs text-white/40">
                  {format(when, "d MMMM yyyy · HH:mm", { locale: it })}
                  {a.location && ` · ${a.location}`}
                </p>
              </div>
              {overdue && (
                <span className="text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap bg-white/5 text-white/40">
                  passato
                </span>
              )}
              <button
                onClick={() => remove(a.id)}
                aria-label="Elimina appuntamento"
                className="text-white/20 hover:text-urgent transition-colors"
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
