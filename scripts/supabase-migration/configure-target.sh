#!/usr/bin/env bash
set -euo pipefail

: "${TARGET_PROJECT_REF:?Set TARGET_PROJECT_REF to the NEW company Supabase project ref}"

echo "Deploying Edge Functions to $TARGET_PROJECT_REF..."
supabase functions deploy --project-ref "$TARGET_PROJECT_REF"

# Set only secrets supplied in the environment. Never commit the values.
SECRET_NAMES=(
  OPENAI_API_KEY
  GEMINI_API_KEY
  ANTHROPIC_API_KEY
  RESEND_API_KEY
  RESEND_FROM_EMAIL
)
for name in "${SECRET_NAMES[@]}"; do
  value="${!name:-}"
  if [[ -n "$value" ]]; then
    echo "Setting $name"
    supabase secrets set --project-ref "$TARGET_PROJECT_REF" "$name=$value"
  else
    echo "Skipping $name (not supplied)"
  fi
done

echo "Edge Functions deployed. Configure Auth URLs/providers and run recreate-cron.sql next."
