"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { Baby, Plus, Trash2, CalendarClock, Stethoscope, CalendarDays, FlaskConical, ListChecks } from "lucide-react";
import { MemoryCard } from "@/components/timeline/MemoryCard";
import { CaptureSheet } from "@/components/capture/CaptureSheet";
import { weeklyEntryFor } from "@/lib/pregnancy/weeklyContent";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// Preset di promemoria coerenti con quelli già disponibili in Calendario e
// Scadenze (vedi appointments/page.tsx e deadlines/page.tsx) — qui in forma
// ridotta a checkbox invece del picker completo, per tenere questa pagina
// già densa di sezioni più leggera da usare.
const APPOINTMENT_REMINDER_PRESETS = [
  { label: "1 giorno prima", minutes: 1440 },
  { label: "3 ore prima", minutes: 180 },
  { label: "1 ora prima", minutes: 60 },
];
const DEADLINE_REMINDER_PRESETS = [
  { label: "15 giorni prima", days: 15 },
  { label: "7 giorni prima", days: 7 },
  { label: "3 giorni prima", days: 3 },
];

// 2026-08-31: prima versione della sezione Gravidanza (vedi migrazione 028)
// — countdown, visite specialistiche, appuntamenti, esami di laboratorio e
// scadenze raggruppati in un unico posto, riusando interamente i motori di
// promemoria già esistenti per appuntamenti e scadenze. Nessun consiglio
// clinico in nessun punto di questa pagina: solo organizzazione e
// promemoria — le indicazioni sulla gravidanza restano sempre del medico.
export default function GravidanzaPage() {
  const { data: pregData, isLoading: pregLoading } = useSWR("/api/pregnancy", fetcher);
  const pregnancy = pregData?.pregnancy ?? null;

  if (pregLoading) {
    return (
      <div className="bg-celeste-bg min-h-full px-4 pt-6 pb-24 space-y-4">
        <div className="card-light h-24 animate-pulse bg-celeste-navy/5" />
      </div>
    );
  }

  return (
    <div className="bg-celeste-bg min-h-full px-4 pt-6 pb-24 space-y-6 text-celeste-navy">
      <div className="flex items-center gap-2">
        <Baby size={22} className="text-celeste-accentDark" />
        <h1 className="text-xl font-semibold">Gravidanza</h1>
      </div>
      <p className="text-celeste-muted text-xs -mt-4">
        Solo organizzazione e promemoria: per qualsiasi indicazione sulla gravidanza fai sempre riferimento al tuo
        ginecologo.
      </p>

      {!pregnancy ? (
        <PregnancySetup />
      ) : (
        <>
          <CountdownCard week={pregnancy.current_week} daysRemaining={pregnancy.days_remaining} dueDate={pregnancy.due_date} />
          <AppointmentsSection
            title="Visite specialistiche"
            icon={Stethoscope}
            category="visita_specialistica"
            emptyText="Nessuna visita in programma."
          />
          <AppointmentsSection
            title="Appuntamenti"
            icon={CalendarDays}
            category={null}
            emptyText="Nessun altro appuntamento in programma."
          />
          <ExamsSection />
          <DeadlinesSection />
          <ChecklistSection />

          <details className="text-xs text-celeste-muted px-1">
            <summary className="cursor-pointer">Cambia data presunta del parto</summary>
            <div className="mt-2">
              <PregnancySetup existingDueDate={pregnancy.due_date} />
            </div>
          </details>
        </>
      )}
    </div>
  );
}

function PregnancySetup({ existingDueDate }: { existingDueDate?: string }) {
  const [dueDate, setDueDate] = useState(existingDueDate ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!dueDate) {
      setError("Inserisci la data presunta del parto.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/pregnancy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ due_date: dueDate }),
      });
      if (!res.ok) throw new Error();
      mutate("/api/pregnancy");
    } catch {
      setError("Salvataggio fallito. Riprova.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card-light space-y-3">
      {!existingDueDate && (
        <div>
          <p className="font-medium">Data presunta del parto</p>
          <p className="text-sm text-celeste-muted mt-1">
            La trovi sul referto della prima ecografia o te la comunica il ginecologo. Da qui calcoliamo il
            countdown e la settimana in corso.
          </p>
        </div>
      )}
      <div className="flex gap-2">
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="input-field-light flex-1"
        />
        <button onClick={save} disabled={saving} className="btn-primary-light px-4">
          {saving ? "…" : "Salva"}
        </button>
      </div>
      {error && <p className="text-urgent text-sm">{error}</p>}
    </div>
  );
}

function CountdownCard({ week, daysRemaining, dueDate }: { week: number; daysRemaining: number; dueDate: string }) {
  const entry = weeklyEntryFor(week);

  return (
    <div className="card-light space-y-2 bg-gradient-to-br from-celeste-accent/10 to-transparent">
      <p className="text-sm text-celeste-muted">
        {daysRemaining > 0
          ? `Mancano ${daysRemaining} giorni alla data presunta del parto`
          : daysRemaining === 0
            ? "È oggi la data presunta del parto"
            : `Data presunta del parto: ${new Date(dueDate).toLocaleDateString("it-IT")}`}
      </p>
      <p className="text-2xl font-semibold text-celeste-accentDark">{week}ª settimana</p>
      <p className="text-sm">
        Il bambino è circa grande come <strong>{entry.size}</strong>. {entry.note}
      </p>
    </div>
  );
}

function AppointmentsSection({
  title,
  icon: Icon,
  category,
  emptyText,
}: {
  title: string;
  icon: any;
  category: string | null;
  emptyText: string;
}) {
  const { data, isLoading } = useSWR("/api/appointments?is_pregnancy=true", fetcher);
  const all = data?.appointments ?? [];
  const items = all.filter((a: any) => (category ? a.category === category : !a.category));

  const [open, setOpen] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [when, setWhen] = useState("");
  const [location, setLocation] = useState("");
  const [reminders, setReminders] = useState<number[]>([1440, 60]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleReminder(minutes: number) {
    setReminders((prev) => (prev.includes(minutes) ? prev.filter((m) => m !== minutes) : [...prev, minutes]));
  }

  async function save() {
    if (!formTitle || !when) {
      setError("Titolo e data/ora sono obbligatori.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formTitle,
          appointment_at: new Date(when).toISOString(),
          location: location || null,
          reminder_minutes_before: reminders,
          is_pregnancy: true,
          category,
        }),
      });
      if (!res.ok) throw new Error();
      mutate("/api/appointments?is_pregnancy=true");
      setFormTitle("");
      setWhen("");
      setLocation("");
      setOpen(false);
    } catch {
      setError("Salvataggio fallito. Riprova.");
    } finally {
      setSaving(false);
    }
  }

  async function complete(id: string) {
    await fetch(`/api/appointments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: true }),
    });
    mutate("/api/appointments?is_pregnancy=true");
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2 font-medium">
          <Icon size={16} className="text-celeste-accentDark" />
          <span>{title}</span>
        </div>
        <button onClick={() => setOpen((o) => !o)} className="text-celeste-accentDark text-xs flex items-center gap-1">
          <Plus size={14} /> Aggiungi
        </button>
      </div>

      {open && (
        <div className="card-light space-y-2">
          <input
            placeholder="Titolo (es. Visita ginecologica)"
            value={formTitle}
            onChange={(e) => setFormTitle(e.target.value)}
            className="input-field-light w-full"
          />
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="input-field-light w-full" />
          <input
            placeholder="Luogo (opzionale)"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="input-field-light w-full"
          />
          <div className="flex flex-wrap gap-1.5">
            {APPOINTMENT_REMINDER_PRESETS.map((p) => (
              <button
                key={p.minutes}
                onClick={() => toggleReminder(p.minutes)}
                className={`text-xs px-2.5 py-1 rounded-full border ${
                  reminders.includes(p.minutes)
                    ? "bg-celeste-accentDark text-white border-celeste-accentDark"
                    : "border-celeste-navy/15 text-celeste-muted"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {error && <p className="text-urgent text-sm">{error}</p>}
          <button onClick={save} disabled={saving} className="btn-primary-light w-full">
            {saving ? "Salvo…" : "Salva"}
          </button>
        </div>
      )}

      {isLoading && <div className="card-light h-14 animate-pulse bg-celeste-navy/5" />}
      {!isLoading && items.length === 0 && <p className="text-celeste-muted text-sm px-1">{emptyText}</p>}
      {items.map((a: any) => (
        <div key={a.id} className="card-light py-2.5 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{a.title}</p>
            <p className="text-xs text-celeste-muted mt-0.5">
              {new Date(a.appointment_at).toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" })}
              {a.location ? ` · ${a.location}` : ""}
            </p>
          </div>
          <button onClick={() => complete(a.id)} className="text-xs text-celeste-accentDark shrink-0">
            Fatto
          </button>
        </div>
      ))}
    </div>
  );
}

function ExamsSection() {
  const { data, isLoading } = useSWR("/api/memories?is_pregnancy=true&limit=50", fetcher);
  const memories = data?.memories ?? [];
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2 font-medium">
          <FlaskConical size={16} className="text-celeste-accentDark" />
          <span>Esami di laboratorio e referti</span>
        </div>
        <button onClick={() => setSheetOpen(true)} className="text-celeste-accentDark text-xs flex items-center gap-1">
          <Plus size={14} /> Aggiungi
        </button>
      </div>

      {isLoading && <div className="card-light h-14 animate-pulse bg-celeste-navy/5" />}
      {!isLoading && memories.length === 0 && (
        <p className="text-celeste-muted text-sm px-1">Nessun referto ancora. Carica la foto o il file di un esame.</p>
      )}
      {memories.map((m: any) => (
        <MemoryCard key={m.id} memory={m} light />
      ))}

      <CaptureSheet
        open={sheetOpen}
        onClose={() => {
          setSheetOpen(false);
          mutate("/api/memories?is_pregnancy=true&limit=50");
        }}
        initialTab="image"
        allowedTabs={["image", "document"]}
        healthMode
        pregnancyMode
      />
    </div>
  );
}

function DeadlinesSection() {
  const { data, isLoading } = useSWR("/api/deadlines?is_pregnancy=true", fetcher);
  const deadlines = data?.deadlines ?? [];

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [reminderDays, setReminderDays] = useState<number[]>([7, 3]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleDay(days: number) {
    setReminderDays((prev) => (prev.includes(days) ? prev.filter((d) => d !== days) : [...prev, days]));
  }

  async function save() {
    if (!title || !dueDate) {
      setError("Titolo e data sono obbligatori.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/deadlines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          due_date: dueDate,
          reminder_days_before: reminderDays,
          is_pregnancy: true,
        }),
      });
      if (!res.ok) throw new Error();
      mutate("/api/deadlines?is_pregnancy=true");
      setTitle("");
      setDueDate("");
      setOpen(false);
    } catch {
      setError("Salvataggio fallito. Riprova.");
    } finally {
      setSaving(false);
    }
  }

  async function complete(id: string) {
    await fetch(`/api/deadlines/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: true }),
    });
    mutate("/api/deadlines?is_pregnancy=true");
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2 font-medium">
          <CalendarClock size={16} className="text-celeste-accentDark" />
          <span>Scadenze</span>
        </div>
        <button onClick={() => setOpen((o) => !o)} className="text-celeste-accentDark text-xs flex items-center gap-1">
          <Plus size={14} /> Aggiungi
        </button>
      </div>

      {open && (
        <div className="card-light space-y-2">
          <input
            placeholder="Es. Ripetere le analisi del sangue"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input-field-light w-full"
          />
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="input-field-light w-full" />
          <div className="flex flex-wrap gap-1.5">
            {DEADLINE_REMINDER_PRESETS.map((p) => (
              <button
                key={p.days}
                onClick={() => toggleDay(p.days)}
                className={`text-xs px-2.5 py-1 rounded-full border ${
                  reminderDays.includes(p.days)
                    ? "bg-celeste-accentDark text-white border-celeste-accentDark"
                    : "border-celeste-navy/15 text-celeste-muted"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {error && <p className="text-urgent text-sm">{error}</p>}
          <button onClick={save} disabled={saving} className="btn-primary-light w-full">
            {saving ? "Salvo…" : "Salva"}
          </button>
        </div>
      )}

      {isLoading && <div className="card-light h-14 animate-pulse bg-celeste-navy/5" />}
      {!isLoading && deadlines.length === 0 && <p className="text-celeste-muted text-sm px-1">Nessuna scadenza in sospeso.</p>}
      {deadlines.map((d: any) => (
        <div key={d.id} className="card-light py-2.5 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{d.title}</p>
            <p className="text-xs text-celeste-muted mt-0.5">{new Date(d.due_date).toLocaleDateString("it-IT")}</p>
          </div>
          <button onClick={() => complete(d.id)} className="text-xs text-celeste-accentDark shrink-0">
            Fatto
          </button>
        </div>
      ))}
    </div>
  );
}

function ChecklistSection() {
  const { data, isLoading } = useSWR("/api/pregnancy/checklist", fetcher);
  const items = data?.items ?? [];
  const [label, setLabel] = useState("");
  const [adding, setAdding] = useState(false);

  async function toggle(id: string, done: boolean) {
    await fetch(`/api/pregnancy/checklist/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !done }),
    });
    mutate("/api/pregnancy/checklist");
  }

  async function remove(id: string) {
    await fetch(`/api/pregnancy/checklist/${id}`, { method: "DELETE" });
    mutate("/api/pregnancy/checklist");
  }

  async function add() {
    if (!label.trim()) return;
    setAdding(true);
    try {
      await fetch("/api/pregnancy/checklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      setLabel("");
      mutate("/api/pregnancy/checklist");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 font-medium px-1">
        <ListChecks size={16} className="text-celeste-accentDark" />
        <span>Da preparare</span>
      </div>

      {isLoading && <div className="card-light h-14 animate-pulse bg-celeste-navy/5" />}

      <div className="card-light space-y-1">
        {items.map((it: any) => (
          <div key={it.id} className="flex items-center gap-2 py-1">
            <input type="checkbox" checked={it.done} onChange={() => toggle(it.id, it.done)} className="w-4 h-4 accent-celeste-accentDark" />
            <span className={`flex-1 text-sm ${it.done ? "line-through text-celeste-muted" : ""}`}>{it.label}</span>
            <button onClick={() => remove(it.id)} className="text-celeste-muted hover:text-urgent">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <div className="flex gap-2 pt-2">
          <input
            placeholder="Aggiungi voce…"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            className="input-field-light flex-1 text-sm"
          />
          <button onClick={add} disabled={adding} className="btn-primary-light px-3">
            <Plus size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
