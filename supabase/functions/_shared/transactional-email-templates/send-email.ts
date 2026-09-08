import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { TEMPLATES } from './registry.ts'

const RESEND_API_URL = 'https://api.resend.com/emails'
const AGENTMAIL_API_BASE = 'https://api.agentmail.to/v0'
let resolvedAgentMailInbox: Promise<string> | null = null

export type SendTemplateEmailResult =
  | { sent: true; provider: 'resend' | 'agentmail'; messageId?: string; threadId?: string }
  | { sent: false; reason: 'recipient_suppressed' }

export interface SendTemplateEmailOptions {
  templateData?: Record<string, any>
  /** Prevents duplicate emails when a scheduled request is retried within 24 hours. */
  idempotencyKey?: string
  replyTo?: string
}

function requireResendKey(): string {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) throw new Error('RESEND_API_KEY is not configured')
  return apiKey
}

function resendFrom(): string {
  return Deno.env.get('RESEND_FROM_EMAIL')?.trim() || 'KINAIR <onboarding@resend.dev>'
}

function requireAgentMailKey(): string {
  const apiKey = Deno.env.get('AGENTMAIL_API_KEY')
  if (!apiKey) throw new Error('AGENTMAIL_API_KEY is not configured')
  return apiKey
}

async function resolveAgentMailInbox(apiKey: string): Promise<string> {
  const configured = Deno.env.get('AGENTMAIL_INBOX_ID')?.trim()
  if (configured) return configured
  resolvedAgentMailInbox ??= (async () => {
    const response = await fetch(`${AGENTMAIL_API_BASE}/inboxes?limit=1`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    const raw = await response.text()
    if (!response.ok) {
      throw new Error(`AgentMail inbox lookup failed (${response.status}): ${raw.slice(0, 500)}`)
    }
    const data = JSON.parse(raw)
    const inboxId = data?.inboxes?.[0]?.inbox_id
    if (!inboxId) throw new Error('No AgentMail inbox exists')
    return String(inboxId)
  })()
  return resolvedAgentMailInbox
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function validIdempotencyKey(value: string): string {
  const sanitized = value.replace(/[^A-Za-z0-9._~-]/g, '-').slice(0, 256)
  return sanitized || crypto.randomUUID()
}

export async function sendTemplateEmail(
  templateName: string,
  to: string,
  options: SendTemplateEmailOptions = {}
): Promise<SendTemplateEmailResult> {
  const template = TEMPLATES[templateName]
  if (!template) {
    throw new Error(
      `Template '${templateName}' not found. Available: ${Object.keys(TEMPLATES).join(', ')}`
    )
  }

  const recipient = template.to || to
  if (!recipient) {
    throw new Error('Recipient is required (the template defines no fixed recipient)')
  }

  const templateData = options.templateData ?? {}
  const element = React.createElement(template.component, templateData)
  const html = await renderAsync(element)
  const text = await renderAsync(element, { plainText: true })
  const subject =
    typeof template.subject === 'function'
      ? template.subject(templateData)
      : template.subject

  const idempotencyKey = validIdempotencyKey(options.idempotencyKey || crypto.randomUUID())
  let resendFailure = 'not attempted'

  try {
    const apiKey = requireResendKey()
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        from: resendFrom(),
        to: [recipient],
        subject,
        html,
        text,
        ...(options.replyTo ? { reply_to: options.replyTo } : {}),
      }),
    })
    const raw = await response.text()
    if (!response.ok) throw new Error(`Resend send failed (${response.status}): ${raw.slice(0, 500)}`)
    const result = raw ? JSON.parse(raw) : {}
    return { sent: true, provider: 'resend', messageId: result.id }
  } catch (error) {
    resendFailure = errorMessage(error)
    console.warn('Resend unavailable; using AgentMail fallback:', resendFailure)
  }

  try {
    const apiKey = requireAgentMailKey()
    const inboxId = await resolveAgentMailInbox(apiKey)
    const response = await fetch(
      `${AGENTMAIL_API_BASE}/inboxes/${encodeURIComponent(inboxId)}/messages/send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          to: [recipient],
          subject,
          html,
          text,
          ...(options.replyTo ? { reply_to: options.replyTo } : {}),
        }),
      },
    )
    const raw = await response.text()
    if (!response.ok) throw new Error(`AgentMail send failed (${response.status}): ${raw.slice(0, 500)}`)
    const result = raw ? JSON.parse(raw) : {}
    return { sent: true, provider: 'agentmail', messageId: result.message_id, threadId: result.thread_id }
  } catch (agentMailError) {
    throw new Error(`All email providers failed. Resend: ${resendFailure}; AgentMail: ${errorMessage(agentMailError)}`)
  }
}
