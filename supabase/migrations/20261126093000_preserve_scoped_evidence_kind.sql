-- Preserve source kind when linking a 4079 notification or CSV to a statement.
-- Only the validated monthly-statement intake sets statementAccountSuffix.
create or replace function public.upsert_scoped_statement_entry(payload jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  existing public.bank_import_entries;
  result_id uuid;
  observed_time text;
  incoming_time text := left(coalesce(payload->>'transaction_time', ''), 5);
begin
  if payload->>'destination_account_suffix' <> '4079' or payload->>'entry_fingerprint' not like 'scoped4079:%' then
    raise exception 'Unsupported scoped statement account';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(payload->>'entry_fingerprint', 0));
  select * into existing from public.bank_import_entries where entry_fingerprint = payload->>'entry_fingerprint';
  if found then
    observed_time := coalesce(nullif(left(existing.transaction_time, 5), ''), existing.raw_metadata->>'observedMinute', '');
    if incoming_time <> '' and observed_time <> '' and incoming_time <> observed_time then
      raise exception 'Ambiguous same-day credit: distinct notification times require review';
    end if;
    result_id := existing.id;
    if incoming_time <> '' and observed_time = '' then
      update public.bank_import_entries set raw_metadata = raw_metadata || jsonb_build_object('observedMinute', incoming_time) where id = result_id;
    end if;
  else
    insert into public.bank_import_entries (file_id, organization_id, property_id, entry_fingerprint,
      transaction_type, transaction_date, transaction_time, reference, description, payer_name, amount,
      destination_account_suffix, available_balance, raw_extracted_text, raw_metadata)
    values ((payload->>'file_id')::uuid, (payload->>'organization_id')::uuid, (payload->>'property_id')::uuid,
      payload->>'entry_fingerprint', payload->>'transaction_type', (payload->>'transaction_date')::date,
      payload->>'transaction_time', payload->>'reference', payload->>'description', payload->>'payer_name',
      (payload->>'amount')::numeric, '4079', (payload->>'available_balance')::numeric,
      payload->>'raw_extracted_text', payload->'raw_metadata') returning id into result_id;
  end if;
  update public.bank_import_files set raw_metadata = raw_metadata || jsonb_build_object('canonicalEntryIds',
    (select jsonb_agg(distinct value) from jsonb_array_elements(coalesce(raw_metadata->'canonicalEntryIds', '[]'::jsonb) || jsonb_build_array(result_id))))
    where id = (payload->>'file_id')::uuid;
  return result_id;
end;
$$;
revoke all on function public.upsert_scoped_statement_entry(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_scoped_statement_entry(jsonb) to service_role;
