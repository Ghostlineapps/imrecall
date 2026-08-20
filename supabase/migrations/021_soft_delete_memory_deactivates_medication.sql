-- IMRECALL — 021: cancellare il ricordo di un farmaco deve fermare i promemoria
--
-- Bug segnalato dall'utente: ha ricancellato dei farmaci già presenti,
-- ricreandoli, ma quelli vecchi hanno continuato a generare notifiche di
-- assunzione anche dopo la cancellazione ("stamattina ho avuto due
-- notifiche"). Confermato in produzione: soft_delete_memory() (migrazione
-- 018) marca deleted_at sulla riga in "memories", ma non tocca in alcun modo
-- la riga collegata in "medications" — che resta active=true e continua a
-- essere considerata dal cron /api/cron/medications. Inoltre non esiste,
-- in nessun punto della UI, un'azione che chiami DELETE /api/medications/[id]
-- direttamente: l'unico modo che l'utente ha per "cancellare un farmaco" è
-- cancellare il ricordo che lo rappresenta.
--
-- Fix: soft_delete_memory() ora, nella stessa funzione SECURITY DEFINER,
-- disattiva (active = false) qualunque riga di "medications" collegata al
-- ricordo appena cancellato (memory_id = p_id). Scelto "disattiva" e non
-- "cancella la riga farmaco": stesso pattern soft-delete già usato per i
-- ricordi, e mantiene lo storico/dose per eventuale consultazione futura
-- senza generare più promemoria. Il controllo di proprietà resta implicito:
-- l'update su medications tocca solo righe il cui memory_id è quello appena
-- verificato di proprietà dell'utente nell'update precedente su memories.
create or replace function soft_delete_memory(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $body$
begin
  update memories
  set deleted_at = now()
  where id = p_id
    and user_id = auth.uid()
    and deleted_at is null;

  update medications
  set active = false
  where memory_id = p_id
    and active = true;
end;
$body$;

grant execute on function soft_delete_memory(uuid) to authenticated;
