# KINAIR Supabase migration toolkit

This folder prepares a controlled move from the current Supabase project to a new company-controlled Supabase project.

## Safety model

The current production database remains the source of truth until final cutover. Do not replay every historical GitHub migration into a blank project as the primary migration method. Earlier project moves created migration-version drift. Use a full database backup/restore, then use the repository for future migrations.

## Required tools

- Supabase CLI
- PostgreSQL client / `psql`
- Node.js 20+
- project access to both source and target Supabase projects

## Environment

Copy `.env.example` to a private local file and set the values. Never commit secret keys.

## Run order

1. **Create the new company Supabase project** in the desired region.
2. **Database backup**
   ```bash
   source ./your-private-env-file
   bash scripts/supabase-migration/backup-current.sh
   ```
3. **Database restore**
   ```bash
   bash scripts/supabase-migration/restore-target.sh supabase-backup/<timestamp>
   ```
4. **Copy Storage object bytes**
   ```bash
   node scripts/supabase-migration/copy-storage.mjs
   ```
   The script preserves bucket names and object paths and uses upsert so it can be safely resumed.
5. **Deploy Edge Functions and supplied secrets**
   ```bash
   bash scripts/supabase-migration/configure-target.sh
   ```
6. In the new Supabase Vault, create/update:
   - `kinair_project_url`
   - `kinair_publishable_key`
   - `kinair_lpo_cron_secret`

   The cron secret must match the secret expected by the deployed LPO functions.
7. Run `recreate-cron.sql` on the target database.
8. Recreate/verify Supabase project-level Auth settings: redirect URLs, email provider/templates, allowed origins and any custom domain configuration.
9. Run `verify-target.sql` and compare results with the source baseline.
10. Update Vercel/company deployment environment variables to the target Supabase URL and publishable key.
11. Run full application acceptance testing before cutting traffic over.

## Current production baseline (2026-10-06)

- 13 Edge Functions tracked in the repository
- 6 Storage buckets
- 231 Storage objects (about 547 MB at audit time)
- 6 email Auth users
- 2 active LPO cron jobs
- Submittal Control database + Storage protected by approved-user, tenant and feature-access rules

Counts can change after this audit; always verify immediately before migration.

## Storage

The migration copies these buckets when present:

- `air-curtain-assets`
- `brand-assets`
- `lpo-documents`
- `project-datasheets`
- `software-releases`
- `submittal-control`

Bucket metadata in the target is updated to match the source. Object paths are preserved because application records refer to them.

## Secrets

The toolkit never stores actual secret values in Git. Edge Functions currently require project secrets such as:

- `OPENAI_API_KEY`
- `GEMINI_API_KEY`
- `ANTHROPIC_API_KEY`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

The target project's `SUPABASE_URL`, `SUPABASE_ANON_KEY` / publishable key and `SUPABASE_SERVICE_ROLE_KEY` are project-provided runtime variables.

## Cutover rule

Do not delete or pause the old Supabase project until:
- Storage counts and critical file downloads match;
- all 13 Edge Functions are deployed with correct JWT settings;
- login/approval works;
- LPO and Submittal permissions work;
- Material/PQ/O&M, Compliance and RTCC flows pass;
- PDF/logo/stamp/share-link behavior passes;
- scheduled LPO emails pass.
