-- IMRECALL — 019: ricorrenza flessibile per i farmaci
--
-- Finora ogni farmaco attivo veniva ricordato TUTTI i giorni, agli orari in
-- medications.times — bene per la maggior parte dei casi, ma non copre
-- farmaci presi con cadenza diversa dal quotidiano: insulina settimanale,
-- vitamina D una volta al mese, farmaci a giorni alterni, o un antibiotico
-- da prendere solo per un certo numero di giorni.
--
-- Modello scelto, pensato per restare semplice in UI (vedi
-- MedicationCapture.tsx) pur coprendo tutti i casi richiesti:
--   - 'daily'   (default, comportamento invariato): tutti i giorni.
--   - 'weekly'  : solo nei giorni della settimana elencati in days_of_week
--                 (0=domenica..6=sabato — stessa convenzione di
--                 Date.prototype.getDay()). Un farmaco preso "una volta a
--                 settimana" è semplicemente un solo giorno spuntato.
--   - 'interval': ogni N giorni a partire da interval_anchor_date — questo
--                 è il modo corretto di rappresentare "giorni alterni"
--                 (interval_days = 2), cosa che un selettore di giorni
--                 della settimana da solo NON può esprimere in modo
--                 preciso (l'alternanza scivola sui giorni della settimana
--                 di settimana in settimana).
--   - 'monthly' : una volta al mese, nel giorno indicato da day_of_month
--                 (1-31; se il mese è più corto, es. day_of_month=31 a
--                 febbraio, quel mese semplicemente non scatta — non
--                 slitta al giorno più vicino, per restare prevedibile).
--
-- start_date/end_date sono ortogonali al tipo di ricorrenza e opzionali:
-- servono per farmaci a ciclo limitato nel tempo (un antibiotico preso
-- ogni giorno ma solo per 7 giorni).
alter table medications
  add column recurrence_type text not null default 'daily'
    check (recurrence_type in ('daily', 'weekly', 'interval', 'monthly')),
  add column days_of_week int[],           -- usato se recurrence_type='weekly'; 0=domenica..6=sabato
  add column interval_days int,            -- usato se recurrence_type='interval'; es. 2 = giorni alterni
  add column interval_anchor_date date,    -- data di riferimento per il calcolo dell'intervallo
  add column day_of_month int,             -- usato se recurrence_type='monthly'; 1-31
  add column start_date date,              -- opzionale, farmaco a ciclo limitato
  add column end_date date;                -- opzionale, farmaco a ciclo limitato

alter table medications
  add constraint medications_day_of_month_range
    check (day_of_month is null or (day_of_month between 1 and 31)),
  add constraint medications_interval_days_positive
    check (interval_days is null or interval_days >= 1);
