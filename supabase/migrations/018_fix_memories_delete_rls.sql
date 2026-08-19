-- IMRECALL — 018: fix soft-delete dei ricordi bloccato dalla RLS
--
-- Bug scoperto verificando la cancellazione di due ricordi di test (farmaci):
-- DELETE /api/memories/[id] falliva sempre con "new row violates row-level
-- security policy for table \"memories\"", per QUALSIASI utente, probabilmente
-- da sempre.
--
-- Prima ipotesi (sbagliata, testata e scartata in questa stessa sessione):
-- la policy "memories_own" (migrazione 006) è "for all using (auth.uid() =
-- user_id and deleted_at is null)" SENZA una WITH CHECK esplicita — in
-- Postgres questo fa sì che la USING clause venga riusata come WITH CHECK
-- sulla riga aggiornata, quindi ogni soft-delete (deleted_at: null -> now())
-- viola la propria stessa policy. Aggiungere una WITH CHECK esplicita
-- (auth.uid() = user_id, senza riferimento a deleted_at) sembrava il fix
-- ovvio — ma verificato direttamente in SQL Editor con un utente reale,
-- l'UPDATE falliva ANCORA con lo stesso errore, identico WITH CHECK.
--
-- Causa reale (confermata empiricamente in questa sessione, isolando le
-- variabili una alla volta in transazioni di test con rollback): quando una
-- tabella ha RLS abilitata e ESISTE una policy applicabile a SELECT la cui
-- USING clause referenzia deleted_at (per nascondere i ricordi già
-- cancellati dalle liste/ricerche — comportamento voluto), Postgres applica
-- QUELLA USING clause anche alla riga risultante di un UPDATE, in aggiunta
-- alla WITH CHECK della policy UPDATE — indipendentemente dal fatto che la
-- policy UPDATE stessa non menzioni affatto deleted_at. Quindi qualunque
-- UPDATE che porta deleted_at da null a un valore non-null viola la policy
-- SELECT (che richiede deleted_at is null) e fallisce, anche con una WITH
-- CHECK "corretta" sulla policy UPDATE. Rimuovere del tutto deleted_at
-- dalla USING (sia per SELECT che per UPDATE) risolverebbe l'UPDATE, ma
-- farebbe ricomparire i ricordi cancellati nelle liste/ricerche che si
-- affidano a RLS invece che a un filtro esplicito in query — troppo
-- rischioso da verificare per ogni endpoint in questo momento.
--
-- Fix scelto: la policy "memories_own" resta INVARIATA rispetto alla
-- migrazione 006 (continua a nascondere via RLS i ricordi con deleted_at
-- non null da SELECT/UPDATE/DELETE ordinari). Il soft-delete passa invece
-- da una funzione SECURITY DEFINER dedicata, che viene eseguita con i
-- privilegi del proprietario della funzione (bypassa RLS) e replica
-- manualmente il controllo di proprietà (auth.uid() = user_id) dentro il
-- corpo della funzione stessa. Questo è il pattern standard consigliato da
-- Supabase per le scritture che devono aggirare questa specifica
-- interazione USING(SELECT)+WITH CHECK(UPDATE) di Postgres.
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
end;
$body$;

grant execute on function soft_delete_memory(uuid) to authenticated;
