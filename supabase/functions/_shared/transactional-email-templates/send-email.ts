import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { TEMPLATES } from './registry.ts'

const RESEND_API_URL = 'https://api.resend.com/emails'

export type SendTemplateEmailResult =
  | { sent: true; messageId?: string; threadId?: string }
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

function validIdempotencyKey(value: string): string {
  const sanitized = value.replace(/[^A-Za-z0-9._~-]/g, '-').slice(0, 256)
  return sanitized || crypto.randomUUID()
}

export async function sendTemplateEmail(
  templateName: string,
  to: string,
  options: SendTemplateEmailOptions = {}
): Promise<SendTemplateEmailResult> {
  const apiKey = requireResendKey()
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

  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': validIdempotencyKey(options.idempotencyKey || crypto.randomUUID()),
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
  if (!response.ok) {
    throw new Error(`Resend send failed (${response.status}): ${raw.slice(0, 500)}`)
  }
  const result = raw ? JSON.parse(raw) : {}
  return { sent: true, messageId: result.id }
}
