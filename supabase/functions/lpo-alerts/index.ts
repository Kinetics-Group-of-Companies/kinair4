import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { sendTemplateEmail } from '../_shared/transactional-email-templates/send-email.ts'

const DAY = 86400000
const RISK_WINDOW_DAYS = 7
const CRON_SECRET_SHA256 = '9a0145f42701522a765dd224dc6712f1f934bec2aad7be109d0bd75a221c980c'
const DAILY_COPY_RECIPIENT = 'deepak@kineticsgroup.ae'

async function hasValidCronSecret(req: Request): Promise<boolean> {
  const supplied = req.headers.get('x-kinair-cron-secret') ?? ''
  if (!supplied) return false
  const bytes = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(supplied)),
  )
  const actual = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  if (actual.length !== CRON_SECRET_SHA256.length) return false
  let mismatch = 0
  for (let i = 0; i < actual.length; i++) {
    mismatch |= actual.charCodeAt(i) ^ CRON_SECRET_SHA256.charCodeAt(i)
  }
  return mismatch === 0
}

const STATUS_LABELS: Record<string, string> = {
  new: 'New Order',
  awaiting_advance: 'Awaiting Advance',
  awaiting_clearance: 'Awaiting Mfg. Clearance',
  in_production: 'In Production',
  ready: 'Ready for Dispatch',
  shipped: 'Shipped',
  delivered: 'Delivered',
  on_hold: 'On Hold',
  cancelled: 'Cancelled',
}

interface Order {
  id: string
  user_id: string
  tenant_id: string
  notify_email: string | null
  lpo_ref: string
  lpo_date: string | null
  client_name: string
  project_name: string | null
  material_type: string
  quoted_lead_time_days: number | null
  lead_time_weeks_min: number | null
  lead_time_weeks_max: number | null
  revised_lead_time_weeks_min: number | null
  revised_lead_time_weeks_max: number | null
  revised_lpo_date: string | null
  revised_lpo_received_date: string | null
  suppliers: { name: string; expected_delivery_date?: string | null }[] | null
  factory_lead_time_days: number | null
  lpo_received_date: string | null
  advance_payment_date: string | null
  manufacturing_clearance_date: string | null
  supplier_po_date: string | null
  committed_delivery_date: string | null
  expected_delivery_date: string | null
  actual_delivery_date: string | null
  site_delivery_date: string | null
  port_eta_date: string | null
  customs_clearance_date: string | null
  next_followup_date: string | null
  priority: string | null
  status: string
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY)
}

function latest(...dates: (string | null | undefined)[]): string | null {
  const valid = dates.filter((d): d is string => !!d)
  return valid.length ? valid.reduce((a, b) => (a > b ? a : b)) : null
}

function promisedDate(o: Order): string | null {
  if (o.committed_delivery_date) return o.committed_delivery_date
  const basis = latest(
    o.revised_lpo_received_date ?? o.lpo_received_date ?? o.revised_lpo_date ?? o.lpo_date,
    o.advance_payment_date,
    o.manufacturing_clearance_date,
  )
  const weeks = o.revised_lead_time_weeks_max ?? o.lead_time_weeks_max ??
    o.revised_lead_time_weeks_min ?? o.lead_time_weeks_min ?? null
  if (basis && weeks != null) return addDays(basis, weeks * 7)
  const start = o.lpo_received_date ?? o.lpo_date ?? null
  if (start && o.quoted_lead_time_days != null) return addDays(start, o.quoted_lead_time_days)
  return null
}

function forecastDate(o: Order): string | null {
  if (o.actual_delivery_date || o.site_delivery_date) return o.actual_delivery_date ?? o.site_delivery_date
  const fromSuppliers = latest(
    ...(o.suppliers ?? []).map((s) => s.expected_delivery_date ?? null),
    o.expected_delivery_date,
    o.port_eta_date,
    o.customs_clearance_date,
  )
  if (fromSuppliers) return fromSuppliers
  const start =
    o.manufacturing_clearance_date ??
    o.supplier_po_date ??
    o.advance_payment_date ??
    o.lpo_received_date ??
    null
  if (start && o.factory_lead_time_days != null) return addDays(start, o.factory_lead_time_days)
  return null
}

type Level = 'overdue' | 'at_risk' | 'on_track' | 'no_dates'

function health(o: Order, today: string): {
  level: Level
  label: string
  detail: string
  promised: string | null
  forecast: string | null
  variance: number | null
} {
  const promised = promisedDate(o)
  const forecast = forecastDate(o)
  if (!promised) {
    return { level: 'no_dates', label: 'Dates missing', detail: 'No committed delivery date or quoted lead time recorded.', promised, forecast, variance: null }
  }
  const daysRemaining = diffDays(promised, today)
  const variance = forecast ? diffDays(forecast, promised) : null
  if (daysRemaining < 0) {
    return {
      level: 'overdue',
      label: `Overdue ${Math.abs(daysRemaining)}d`,
      detail: `The committed date passed ${Math.abs(daysRemaining)} day(s) ago and the order is not delivered.`,
      promised,
      forecast,
      variance: variance ?? Math.abs(daysRemaining),
    }
  }
  if (variance != null && variance > 0) {
    return {
      level: 'at_risk',
      label: `At risk +${variance}d`,
      detail: `The factory forecast is ${variance} day(s) later than the date committed to the client.`,
      promised,
      forecast,
      variance,
    }
  }
  if (daysRemaining <= RISK_WINDOW_DAYS && !forecast) {
    return {
      level: 'at_risk',
      label: 'Confirm delivery',
      detail: `Due in ${daysRemaining} day(s) with no factory forecast recorded.`,
      promised,
      forecast,
      variance: null,
    }
  }
  return { level: 'on_track', label: 'On track', detail: `Due in ${daysRemaining} day(s).`, promised, forecast, variance }
}

function fmt(value: string | null): string {
  if (!value) return '—'
  return new Date(`${value}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  if (!(await hasValidCronSecret(req))) {
    return json({ error: 'Unauthorized' }, 401)
  }

  try {
    let mode = 'delay'
    let dryRun = false
    let testDelivery = false
    try {
      const body = await req.json()
      if (body && typeof body.mode === 'string') mode = body.mode
      dryRun = body?.dry_run === true
      testDelivery = body?.test === true
    } catch {
      // no body — default mode
    }
    if (mode !== 'delay' && mode !== 'weekly') {
      return json({ error: "mode must be 'delay' or 'weekly'" }, 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    )

    const today = new Date().toISOString().slice(0, 10)

    const { data: orders, error } = await supabase
      .from('lpo_orders')
      .select('*')
      .is('actual_delivery_date', null)
      .is('site_delivery_date', null)
      .not('status', 'in', '("delivered","cancelled")')

    if (error) throw error

    const open = (orders ?? []) as Order[]
    if (open.length === 0) return json({ mode, sent: 0, orders: 0 })

    // Resolve recipient emails (order override, else the owner's account email).
    const userIds = [...new Set(open.map((o) => o.user_id).filter(Boolean))]
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id,email')
      .in('user_id', userIds)
    const emailByUser = new Map<string, string>()
    for (const p of profiles ?? []) {
      if (p.email) emailByUser.set(p.user_id, p.email)
    }
    const recipientFor = (o: Order) => o.notify_email || emailByUser.get(o.user_id) || null

    let sent = 0
    let skipped = 0
    let wouldSend = 0

    if (mode === 'delay') {
      for (const o of open) {
        const h = health(o, today)
        if (h.level !== 'overdue' && h.level !== 'at_risk') continue

        const ownerRecipient = recipientFor(o)
        const recipients = testDelivery
          ? [DAILY_COPY_RECIPIENT]
          : [...new Set([ownerRecipient, DAILY_COPY_RECIPIENT].filter((email): email is string => !!email))]

        for (const to of recipients) {
          wouldSend++
          if (dryRun) continue

          // Keep the owner's original daily key and give each monitoring copy
          // its own key. This prevents one recipient from suppressing another.
          const baseAlertKey = `${o.id}:${h.level}:${today}`
          const alertKey = testDelivery
            ? `${baseAlertKey}:test:${DAILY_COPY_RECIPIENT}`
            : to === ownerRecipient
              ? baseAlertKey
              : `${baseAlertKey}:copy:${to.toLowerCase()}`

          if (!testDelivery) {
            const { data: existing } = await supabase
              .from('lpo_alert_log')
              .select('id')
              .eq('alert_key', alertKey)
              .maybeSingle()
            if (existing) {
              skipped++
              continue
            }
          }

          const result = await sendTemplateEmail('lpo-delay-alert', to, {
            idempotencyKey: `lpo-delay-alert-${alertKey}`,
            templateData: {
              lpoRef: o.lpo_ref,
              clientName: o.client_name,
              projectName: o.project_name,
              materialType: o.material_type,
              status: STATUS_LABELS[o.status] ?? o.status,
              severity: h.level === 'overdue' ? 'Overdue' : 'At risk',
              headline:
                h.level === 'overdue'
                  ? 'Order is past its committed delivery date'
                  : 'Potential delay on this order',
              detail: h.detail,
              committedDate: fmt(h.promised),
              forecastDate: fmt(h.forecast),
              varianceDays: h.variance,
            },
          })

          if (!testDelivery) {
            await supabase.from('lpo_alert_log').insert({
              order_id: o.id,
              tenant_id: o.tenant_id,
              recipient_email: to,
              alert_type: h.level,
              alert_key: alertKey,
            })
          }

          if (result.sent) sent++
          else skipped++
        }
      }

      return json({
        mode,
        dry_run: dryRun,
        test: testDelivery,
        daily_copy_recipient: DAILY_COPY_RECIPIENT,
        orders: open.length,
        would_send: wouldSend,
        sent,
        skipped,
      })
    }

    // Weekly summary — one digest per recipient.
    const byRecipient = new Map<string, Order[]>()
    for (const o of open) {
      const to = recipientFor(o)
      if (!to) continue
      const list = byRecipient.get(to) ?? []
      list.push(o)
      byRecipient.set(to, list)
    }

    for (const [to, list] of byRecipient) {
      wouldSend++
      const rows = list.map((o) => ({ o, h: health(o, today) }))
      if (dryRun) continue
      rows.sort((a, b) => (a.h.promised ?? '9999').localeCompare(b.h.promised ?? '9999'))

      const result = await sendTemplateEmail('lpo-weekly-summary', to, {
        idempotencyKey: `lpo-weekly-summary-${to}-${today}`,
        templateData: {
          weekOf: fmt(today),
          total: rows.length,
          overdue: rows.filter((r) => r.h.level === 'overdue').length,
          atRisk: rows.filter((r) => r.h.level === 'at_risk').length,
          onTrack: rows.filter((r) => r.h.level === 'on_track').length,
          orders: rows.map(({ o, h }) => ({
            lpoRef: o.lpo_ref,
            clientName: o.client_name,
            materialType: o.material_type,
            status: STATUS_LABELS[o.status] ?? o.status,
            committedDate: fmt(h.promised),
            forecastDate: fmt(h.forecast),
            health: h.label,
          })),
        },
      })

      await supabase.from('lpo_alert_log').insert({
        order_id: null,
        tenant_id: list[0]?.tenant_id ?? null,
        recipient_email: to,
        alert_type: 'weekly',
        alert_key: `weekly:${to}:${today}`,
      })

      if (result.sent) sent++
      else skipped++
    }

    return json({ mode, dry_run: dryRun, orders: open.length, recipients: byRecipient.size, would_send: wouldSend, sent, skipped })
  } catch (err) {
    console.error('lpo-alerts error', err)
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
