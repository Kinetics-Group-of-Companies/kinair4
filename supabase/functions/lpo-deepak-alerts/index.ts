import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const CRON_SECRET_SHA256 = '9a0145f42701522a765dd224dc6712f1f934bec2aad7be109d0bd75a221c980c'
const DAY = 86400000

async function authorized(req: Request): Promise<boolean> {
  const supplied = req.headers.get('x-kinair-cron-secret') ?? ''
  if (!supplied) return false
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(supplied)))
  const actual = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  if (actual.length !== CRON_SECRET_SHA256.length) return false
  let mismatch = 0
  for (let i = 0; i < actual.length; i++) {
    mismatch |= actual.charCodeAt(i) ^ CRON_SECRET_SHA256.charCodeAt(i)
  }
  return mismatch === 0
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function latest(...values: Array<string | null | undefined>): string | null {
  const dates = values.filter((value): value is string => Boolean(value))
  return dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : null
}

function promisedDate(order: Record<string, any>): string | null {
  if (order.committed_delivery_date) return order.committed_delivery_date
  const basis = latest(
    order.revised_lpo_received_date ?? order.lpo_received_date ?? order.revised_lpo_date ?? order.lpo_date,
    order.advance_payment_date,
    order.manufacturing_clearance_date,
  )
  const weeks = order.revised_lead_time_weeks_max ?? order.lead_time_weeks_max ??
    order.revised_lead_time_weeks_min ?? order.lead_time_weeks_min ?? null
  if (basis && weeks != null) return addDays(basis, Number(weeks) * 7)
  const start = order.lpo_received_date ?? order.lpo_date ?? null
  if (start && order.quoted_lead_time_days != null) return addDays(start, Number(order.quoted_lead_time_days))
  return null
}

function forecastDate(order: Record<string, any>): string | null {
  if (order.actual_delivery_date || order.site_delivery_date) {
    return order.actual_delivery_date ?? order.site_delivery_date
  }
  const supplierDates = Array.isArray(order.suppliers)
    ? order.suppliers.map((supplier: Record<string, any>) => supplier.expected_delivery_date ?? null)
    : []
  const forecast = latest(
    ...supplierDates,
    order.expected_delivery_date,
    order.port_eta_date,
    order.customs_clearance_date,
  )
  if (forecast) return forecast
  const start = order.manufacturing_clearance_date ?? order.supplier_po_date ??
    order.advance_payment_date ?? order.lpo_received_date ?? null
  if (start && order.factory_lead_time_days != null) {
    return addDays(start, Number(order.factory_lead_time_days))
  }
  return null
}

function health(order: Record<string, any>, today: string): { label: string; level: string } {
  const promised = promisedDate(order)
  const forecast = forecastDate(order)
  if (!promised) return { label: 'Dates missing', level: 'missing' }
  const daysRemaining = Math.round((Date.parse(`${promised}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY)
  const variance = forecast
    ? Math.round((Date.parse(`${forecast}T00:00:00Z`) - Date.parse(`${promised}T00:00:00Z`)) / DAY)
    : null
  if (daysRemaining < 0) return { label: `Overdue ${Math.abs(daysRemaining)}d`, level: 'overdue' }
  if (variance != null && variance > 0) return { label: `At risk +${variance}d`, level: 'at_risk' }
  if (daysRemaining <= 7 && !forecast) return { label: 'Confirm delivery', level: 'at_risk' }
  return { label: `On track · ${daysRemaining}d remaining`, level: 'on_track' }
}

function escapeHtml(value: unknown): string {
  return String(value ?? '—')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

const RESEND_API_URL = 'https://api.resend.com/emails'
const AGENTMAIL_API_BASE = 'https://api.agentmail.to/v0'
let resolvedAgentMailInbox: Promise<string> | null = null

function resendFrom(): string {
  const configured = Deno.env.get('RESEND_FROM_EMAIL')?.trim()
  if (configured && !configured.includes('onboarding@resend.dev')) return configured
  return 'KINAIR <alerts@kinair.ae>'
}

async function sendResend(to: string, subject: string, html: string, text: string, idempotencyKey: string) {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) throw new Error('RESEND_API_KEY is not configured')
  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey.replace(/[^A-Za-z0-9._~-]/g, '-').slice(0, 256),
    },
    body: JSON.stringify({
      from: resendFrom(),
      to: [to],
      subject,
      html,
      text,
    }),
  })
  const raw = await response.text()
  if (!response.ok) throw new Error(`Resend send failed (${response.status}): ${raw.slice(0, 500)}`)
  const result = raw ? JSON.parse(raw) : {}
  return { provider: 'resend' as const, message_id: result.id }
}

async function resolveAgentMailInbox(apiKey: string): Promise<string> {
  const configured = Deno.env.get('AGENTMAIL_INBOX_ID')?.trim()
  if (configured) return configured
  resolvedAgentMailInbox ??= (async () => {
    const response = await fetch(`${AGENTMAIL_API_BASE}/inboxes?limit=1`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    const raw = await response.text()
    if (!response.ok) throw new Error(`AgentMail inbox lookup failed (${response.status}): ${raw.slice(0, 500)}`)
    const data = JSON.parse(raw)
    const inboxId = data?.inboxes?.[0]?.inbox_id
    if (!inboxId) throw new Error('No AgentMail inbox exists')
    return String(inboxId)
  })()
  return resolvedAgentMailInbox
}

async function sendAgentMail(to: string, subject: string, html: string, text: string, idempotencyKey: string) {
  const apiKey = Deno.env.get('AGENTMAIL_API_KEY')
  if (!apiKey) throw new Error('AGENTMAIL_API_KEY is not configured')
  const inboxId = await resolveAgentMailInbox(apiKey)
  const response = await fetch(`${AGENTMAIL_API_BASE}/inboxes/${encodeURIComponent(inboxId)}/messages/send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey.replace(/[^A-Za-z0-9._~-]/g, '-').slice(0, 256),
    },
    body: JSON.stringify({ to: [to], subject, html, text }),
  })
  const raw = await response.text()
  if (!response.ok) throw new Error(`AgentMail send failed (${response.status}): ${raw.slice(0, 500)}`)
  const result = raw ? JSON.parse(raw) : {}
  return { provider: 'agentmail' as const, message_id: result.message_id, thread_id: result.thread_id }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function sendWithFallback(to: string, subject: string, html: string, text: string, idempotencyKey: string) {
  let resendFailure = 'not attempted'
  try {
    return await sendResend(to, subject, html, text, idempotencyKey)
  } catch (error) {
    resendFailure = errorMessage(error)
    console.warn('Resend unavailable; using AgentMail fallback:', resendFailure)
  }
  try {
    return await sendAgentMail(to, subject, html, text, idempotencyKey)
  } catch (agentMailError) {
    throw new Error(`All email providers failed. Resend: ${resendFailure}; AgentMail: ${errorMessage(agentMailError)}`)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

  if (!(await authorized(req))) return respond({ error: 'Unauthorized' }, 401)

  try {
    let requestBody: Record<string, unknown> = {}
    try {
      requestBody = await req.json()
    } catch {
      // Scheduled calls may omit a body.
    }
    const test = requestBody?.test === true
    const dryRun = requestBody?.dry_run === true
    const resendOnly = test && requestBody?.provider === 'resend'
    const requestedRecipient =
      typeof requestBody?.recipient === 'string' ? requestBody.recipient.trim().toLowerCase() : null

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    )

    const { data: recipientRows, error: recipientError } = await supabase
      .from('lpo_email_recipients')
      .select('email,tenant_id,all_tenants')
      .eq('is_enabled', true)
    if (recipientError) throw recipientError

    const uniqueRecipients = [...new Map((recipientRows ?? [])
      .map((recipient) => ({
        tenantId: recipient.tenant_id,
        email: String(recipient.email ?? '').trim().toLowerCase(),
        canSeeAll: Boolean(recipient.all_tenants),
      }))
      .filter((recipient) => recipient.email)
      .map((recipient) => [recipient.email, recipient])).values()]

    if (uniqueRecipients.length === 0) {
      return respond({ sent: 0, recipients: 0, reason: 'No enabled LPO email recipients' })
    }

    const selectedRecipients = requestedRecipient
      ? uniqueRecipients.filter((recipient) => recipient.email === requestedRecipient)
      : uniqueRecipients

    if (test && !requestedRecipient) {
      return respond({ error: 'A configured recipient is required for a test send' }, 400)
    }
    if (requestedRecipient && selectedRecipients.length === 0) {
      return respond({ error: 'Recipient is not enabled in Admin LPO email recipients' }, 403)
    }

    const { data, error } = await supabase
      .from('lpo_orders')
      .select('*')
      .is('actual_delivery_date', null)
      .is('site_delivery_date', null)
      .not('status', 'in', '("delivered","cancelled")')
    if (error) throw error

    const today = new Date().toISOString().slice(0, 10)
    const deliveries: Record<string, unknown>[] = []

    for (const recipient of selectedRecipients) {
      const visibleOrders = (data ?? []).filter(
        (order: Record<string, any>) => recipient.canSeeAll || order.tenant_id === recipient.tenantId,
      )
      const orders = visibleOrders.map((order: Record<string, any>) => ({
        order,
        promised: promisedDate(order),
        forecast: forecastDate(order),
        health: health(order, today),
      })).sort((a, b) => (a.promised ?? '9999').localeCompare(b.promised ?? '9999'))

      const overdue = orders.filter((row) => row.health.level === 'overdue').length
      const atRisk = orders.filter((row) => row.health.level === 'at_risk').length
      const onTrack = orders.filter((row) => row.health.level === 'on_track').length
      const rows = orders.map(({ order, promised, forecast, health: orderHealth }) =>
        `<tr><td>${escapeHtml(order.lpo_ref)}</td><td>${escapeHtml(order.client_name)}</td><td>${escapeHtml(order.material_type)}</td><td>${escapeHtml(order.status)}</td><td>${escapeHtml(promised)}</td><td>${escapeHtml(forecast)}</td><td>${escapeHtml(orderHealth.label)}</td></tr>`
      ).join('')

      const subject = `${test ? '[TEST] ' : ''}KINAIR daily LPO summary — ${orders.length} open, ${overdue} overdue`
      const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#222"><h2>KINAIR daily LPO summary</h2><p>Date: ${escapeHtml(today)}</p><p><strong>Open:</strong> ${orders.length} &nbsp; <strong>Overdue:</strong> ${overdue} &nbsp; <strong>At risk:</strong> ${atRisk} &nbsp; <strong>On track:</strong> ${onTrack}</p><table cellpadding="8" cellspacing="0" border="1" style="border-collapse:collapse;font-size:12px"><thead><tr><th>LPO</th><th>Client</th><th>Material</th><th>Status</th><th>Committed</th><th>Forecast</th><th>Health</th></tr></thead><tbody>${rows || '<tr><td colspan="7">No open orders.</td></tr>'}</tbody></table><p style="color:#777;font-size:12px">Open the KINAIR Delivery Tracker for full details and follow-up history.</p></body></html>`
      const text = [
        `KINAIR daily LPO summary — ${today}`,
        `Open: ${orders.length}; Overdue: ${overdue}; At risk: ${atRisk}; On track: ${onTrack}`,
        ...orders.map(({ order, promised, forecast, health: orderHealth }) =>
          `${order.lpo_ref} | ${order.client_name} | ${order.material_type} | committed ${promised ?? '—'} | forecast ${forecast ?? '—'} | ${orderHealth.label}`
        ),
      ].join('\n')

      if (dryRun) {
        deliveries.push({ recipient: recipient.email, orders: orders.length, dry_run: true })
        continue
      }

      const idempotencyKey = test
        ? `lpo-daily-test-${today}-${recipient.email}-${crypto.randomUUID()}`
        : `lpo-daily-${today}-${recipient.email}`
      const delivery = await (resendOnly ? sendResend : sendWithFallback)(
        recipient.email,
        subject,
        html,
        text,
        idempotencyKey,
      )
      deliveries.push({
        recipient: recipient.email,
        orders: orders.length,
        provider: delivery.provider,
        message_id: delivery.message_id,
        thread_id: 'thread_id' in delivery ? delivery.thread_id : undefined,
      })
    }

    return respond({
      sent: dryRun ? 0 : deliveries.length,
      test,
      dry_run: dryRun,
      recipients: selectedRecipients.length,
      deliveries,
    })
  } catch (error) {
    console.error('lpo-deepak-alerts error', error)
    return respond({ error: error instanceof Error ? error.message : String(error) }, 500)
  }
})
