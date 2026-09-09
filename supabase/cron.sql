-- Supabase Cron + pg_net. Run after deploying the `sync` Edge Function.
-- First create the secrets in Vault (choose your own values):
--   project_url = https://YOUR_PROJECT_ID.supabase.co
--   publishable_key = YOUR_PUBLISHABLE_OR_ANON_KEY
--   sync_secret = A_LONG_RANDOM_SECRET
--   sync function must have the same SYNC_SECRET environment secret.

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists vault;

-- Store/update Vault secrets from the SQL editor, once:
-- select vault.create_secret('https://YOUR_PROJECT_ID.supabase.co', 'project_url');
-- select vault.create_secret('YOUR_PUBLISHABLE_OR_ANON_KEY', 'publishable_key');
-- select vault.create_secret('A_LONG_RANDOM_SECRET', 'sync_secret');

select cron.schedule(
  'nfl-player-roster-refresh',
  '15 4 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='project_url') || '/functions/v1/api',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'apikey',(select decrypted_secret from vault.decrypted_secrets where name='publishable_key'),
      'x-sync-secret',(select decrypted_secret from vault.decrypted_secrets where name='sync_secret')
    ),
    body := jsonb_build_object('action','sync','job','players')
  )
  $$
);

select cron.schedule(
  'nfl-weekly-refresh',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='project_url') || '/functions/v1/api',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'apikey',(select decrypted_secret from vault.decrypted_secrets where name='publishable_key'),
      'x-sync-secret',(select decrypted_secret from vault.decrypted_secrets where name='sync_secret')
    ),
    body := jsonb_build_object('action','sync','job','weekly')
  )
  $$
);
