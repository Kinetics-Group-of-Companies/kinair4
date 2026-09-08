# KINAIR Selection Software

Engineering selection software for KINAIR fans and air curtains.

## Architecture

- Frontend: React + Vite
- Hosting and deployments: Vercel
- Source control: GitHub
- Database, authentication, storage and Edge Functions: Supabase
- AI providers: Google Gemini, OpenAI and Anthropic
- Transactional email: Resend, with AgentMail fallback where configured

The fan and air-curtain selection engines run from the application code and catalogue data. They do not require an external AI provider for clear single-duty selections.

## Local development

Requirements: Node.js 20 or later and npm.

```sh
git clone https://github.com/dpkchn786/kinair4.git
cd kinair4
npm ci
npm run dev
```

Create a local `.env` containing:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
VITE_SUPABASE_PROJECT_ID=YOUR_PROJECT_ID
```

Never commit service-role keys or provider API secrets. Server-side secrets belong in Supabase Edge Function secrets.

## Build

```sh
npm run build
```

The generated web application is written to `dist/`. Desktop and Android packaging use the same frontend and local KINAIR selection engines.

## Deployment

The `main` branch deploys automatically to Vercel and serves:

- https://kinair.ae
- https://www.kinair.ae

Supabase functions are maintained from `supabase/functions/` and deployed to the KINAIR Supabase project.
