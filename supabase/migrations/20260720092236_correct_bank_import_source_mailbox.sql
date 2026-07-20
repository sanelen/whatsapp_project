update public.bank_import_mailboxes
set email_address = 'Sanele.ngcobo@gmail.com', updated_at = now()
where lower(email_address) = 'sanele.main@gmail.com';
