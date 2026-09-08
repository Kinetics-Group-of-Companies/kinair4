import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const DEFAULT_TRIAL_MINUTES = 5
const MAX_TRIAL_MINUTES = 60
const TRIAL_TIME_ZONE = 'Asia/Dubai'

function trialDay(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TRIAL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  return `${value('year')}-${value('month')}-${value('day')}`
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function clientIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return req.headers.get('cf-connecting-ip')?.trim()
    || req.headers.get('x-real-ip')?.trim()
    || forwarded
    || null
}

async function hashIp(ip: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ip))
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authorization = req.headers.get('authorization') ?? ''
  if (!authorization.startsWith('Bearer ')) return json({ error: 'Authentication required' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  })
  const { data: userData, error: userError } = await userClient.auth.getUser()
  const user = userData?.user
  if (userError || !user) return json({ error: 'Invalid session' }, 401)
  if (!user.is_anonymous) return json({ error: 'Guest trial is only for visitors without an account' }, 403)

  const ip = clientIp(req)
  if (!ip) return json({ error: 'Unable to verify visitor network' }, 400)
  const ipHash = await hashIp(ip, serviceKey)
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  let body: { action?: string } = {}
  try {
    body = await req.json()
  } catch {
    // Default to status.
  }
  const action = body.action === 'start' ? 'start' : 'status'
  const now = new Date()
  const today = trialDay(now)

  const { data: settings } = await admin
    .from('guest_trial_settings')
    .select('duration_minutes')
    .eq('id', true)
    .maybeSingle()
  const trialMinutes = Math.min(
    MAX_TRIAL_MINUTES,
    Math.max(1, Number(settings?.duration_minutes) || DEFAULT_TRIAL_MINUTES),
  )
  const trialSeconds = trialMinutes * 60

  if (action === 'start') {
    const { data: existing, error: existingError } = await admin
      .from('guest_trials')
      .select('user_id,started_at,expires_at')
      .eq('ip_hash', ipHash)
      .eq('trial_day', today)
      .maybeSingle()
    if (existingError) return json({ error: existingError.message }, 500)

    if (existing) {
      const remaining = Math.max(0, Math.ceil((Date.parse(existing.expires_at) - now.getTime()) / 1000))
      if (existing.user_id === user.id && remaining > 0) {
        const originalMinutes = Math.max(
          1,
          Math.round((Date.parse(existing.expires_at) - Date.parse(existing.started_at)) / 60000),
        )
        return json({
          active: true,
          expires_at: existing.expires_at,
          seconds_remaining: remaining,
          duration_minutes: originalMinutes,
        })
      }
      return json({
        active: false,
        code: 'GUEST_TRIAL_USED',
        error: "Today's five-minute guest trial has already been used on this network. Please sign up to continue or return tomorrow.",
      }, 403)
    }

    const expiresAt = new Date(now.getTime() + trialSeconds * 1000).toISOString()
    const { data: created, error: createError } = await admin
      .from('guest_trials')
      .insert({ user_id: user.id, ip_hash: ipHash, trial_day: today, started_at: now.toISOString(), expires_at: expiresAt })
      .select('expires_at')
      .single()
    if (createError) {
      if (createError.code === '23505') {
        return json({ active: false, code: 'GUEST_TRIAL_USED', error: "Today's guest trial has already been used. Please sign up to continue or return tomorrow." }, 403)
      }
      return json({ error: createError.message }, 500)
    }
    return json({ active: true, expires_at: created.expires_at, seconds_remaining: trialSeconds, duration_minutes: trialMinutes })
  }

  const { data: trial, error: trialError } = await admin
    .from('guest_trials')
    .select('started_at,expires_at')
    .eq('user_id', user.id)
    .eq('ip_hash', ipHash)
    .eq('trial_day', today)
    .maybeSingle()
  if (trialError) return json({ error: trialError.message }, 500)
  const secondsRemaining = trial
    ? Math.max(0, Math.ceil((Date.parse(trial.expires_at) - now.getTime()) / 1000))
    : 0
  return json({
    active: secondsRemaining > 0,
    expires_at: trial?.expires_at ?? null,
    seconds_remaining: secondsRemaining,
    duration_minutes: trial
      ? Math.max(1, Math.round((Date.parse(trial.expires_at) - Date.parse(trial.started_at)) / 60000))
      : trialMinutes,
    code: trial && secondsRemaining === 0 ? 'GUEST_TRIAL_EXPIRED' : undefined,
  })
})
