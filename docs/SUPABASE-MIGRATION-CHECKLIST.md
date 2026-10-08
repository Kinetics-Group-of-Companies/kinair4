# KINAIR Supabase migration checklist

Use this checklist when moving the KINAIR application from the current Supabase project to a company-controlled Supabase project.

## Recommended migration method

Use a **full Supabase database backup/restore** as the source of truth. Do not rely only on replaying the GitHub migration folder because the current production database has historical migration-version drift from earlier project moves and repair migrations.

After the database is restored, keep the GitHub migration history for all future changes.

## 1. New Supabase project

- Create the company project in the required region (current production is ap-south-1).
- Enable any required non-default database extensions before/after restore as required by Supabase.
- Link the repository to the new project only after the database restore is complete.

## 2. Database

Back up and restore:
- roles/schema/data using the official Supabase CLI backup/restore procedure;
- migration history from the `supabase_migrations` schema;
- any custom changes to `auth` and `storage` schemas.

Custom application schemas currently include:
- `public`
- `submittal_private`
- `submittal_recovery`

Important installed extensions used by the current project include:
- pg_cron
- pg_net
- pgcrypto
- uuid-ossp
- pg_stat_statements
- supabase_vault

After restore, verify RLS is enabled and the current policies exist, especially Submittal Control tenant/approval/feature-access policies.

## 3. Auth

Do not assume repository migrations recreate production users.

- Preserve/migrate Auth users using the supported Supabase backup/restore path.
- Verify email identities and user UUIDs remain compatible with `profiles`, `user_roles`, permissions and ownership foreign keys.
- Recreate Auth project settings such as redirect URLs, allowed origins, email templates/providers and password/security settings where they are project-level configuration.

## 4. Storage

Current buckets:
- air-curtain-assets (private)
- brand-assets (public)
- lpo-documents (private)
- project-datasheets (private)
- software-releases (private)
- submittal-control (private)

Database migration/restore can recreate bucket metadata and RLS, but the actual object bytes must also be copied to the new project.

Preserve the exact object paths because database rows and generated documents reference those paths.

## 5. Edge Functions

Deploy all folders under `supabase/functions`.

The repository is intended to track the live function set, including the disabled `issue-v16-release-uploads` endpoint.

JWT configuration must match `supabase/config.toml`.

Project secrets are not stored in Git. Configure the required secrets in the company Supabase project. Current application code expects names including:
- OPENAI_API_KEY
- GEMINI_API_KEY
- ANTHROPIC_API_KEY
- RESEND_API_KEY
- RESEND_FROM_EMAIL

Supabase-provided runtime variables such as SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are supplied by the target project.

Never copy secret values into Git.

## 6. Scheduled jobs

Verify/recreate pg_cron jobs after restore. Current production includes:
- kinair-lpo-daily-delay-alerts — `0 2 * * *`
- kinair-lpo-daily-deepak-summary — `59 3 * * *`

Check that their target Edge Function URLs and authentication use the **new** project.

## 7. Realtime and project-level settings

After restore:
- verify Supabase Realtime publications for the required Submittal tables;
- verify Database Webhooks if used;
- verify custom domains/CORS/redirect URLs;
- verify SMTP/email configuration and Auth settings.

## 8. Frontend / hosting cutover

Update company-controlled deployment environment variables to the new Supabase project:
- Supabase URL
- publishable/anon key
- any project-specific public configuration

Do not put the service-role key in browser/frontend environment variables.

## 9. Validation before production cutover

Test with an approved normal user and an admin:

1. Login and account approval.
2. Fan/Air Curtain selectors and saved projects.
3. LPO Tracker permission ON/OFF.
4. Submittal Control permission ON/OFF.
5. Material/PQ/O&M submittal creation.
6. Compliance Statement Excel -> upload -> PDF.
7. RTCC Excel -> upload -> PDF.
8. Source file upload/download and large PDFs.
9. Company/brand logos, stamps and document library.
10. Issued revision locking and new revision creation.
11. 7-day Submittal share link.
12. LPO scheduled emails.
13. AI routing and OCR with all configured providers.

Keep the old project read-only/available until this validation passes.
