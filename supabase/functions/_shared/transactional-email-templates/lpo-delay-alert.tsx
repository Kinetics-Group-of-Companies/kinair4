import * as React from 'npm:react@18.3.1'
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  lpoRef?: string
  clientName?: string
  projectName?: string | null
  materialType?: string
  status?: string
  severity?: string
  headline?: string
  detail?: string
  committedDate?: string
  forecastDate?: string
  varianceDays?: number | null
}

const Email = ({
  lpoRef = '—',
  clientName = '—',
  projectName,
  materialType = '—',
  status = '—',
  severity = 'At risk',
  headline = 'Delivery needs attention',
  detail = '',
  committedDate = '—',
  forecastDate = '—',
  varianceDays = null,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`${severity}: ${lpoRef} — ${clientName}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>KINAIR · Delivery Tracker</Text>
        <Section style={severity === 'Overdue' ? bannerDanger : bannerWarn}>
          <Text style={bannerText}>{severity.toUpperCase()}</Text>
        </Section>
        <Heading style={h1}>{headline}</Heading>
        <Text style={text}>{detail}</Text>
        <Hr style={hr} />
        <Row label="LPO Ref" value={lpoRef} />
        <Row label="Client" value={clientName} />
        {projectName ? <Row label="Project" value={projectName} /> : null}
        <Row label="Material" value={materialType} />
        <Row label="Status" value={status} />
        <Row label="Committed delivery" value={committedDate} />
        <Row label="Forecast delivery" value={forecastDate} />
        {varianceDays != null ? (
          <Row
            label="Variance"
            value={varianceDays > 0 ? `${varianceDays} day(s) late` : `${Math.abs(varianceDays)} day(s) early`}
          />
        ) : null}
        <Hr style={hr} />
        <Text style={muted}>
          Open the Delivery Tracker in your KINAIR portal to log a follow-up or update the dates.
        </Text>
      </Container>
    </Body>
  </Html>
)

const Row = ({ label, value }: { label: string; value: string }) => (
  <Text style={rowStyle}>
    <span style={rowLabel}>{label}</span>
    <span style={rowValue}>{value}</span>
  </Text>
)

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    `${data?.severity ?? 'Delivery alert'}: LPO ${data?.lpoRef ?? ''} — ${data?.clientName ?? ''}`.trim(),
  displayName: 'LPO delivery delay alert',
  previewData: {
    lpoRef: 'LPO-2026-0142',
    clientName: 'Al Futtaim Engineering',
    projectName: 'Dubai Hills Mall — Phase 2',
    materialType: 'FAHU',
    status: 'In Production',
    severity: 'Overdue',
    headline: 'Order is past its committed delivery date',
    detail: 'The committed date passed 4 day(s) ago and the order is not delivered.',
    committedDate: '28 Aug 2026',
    forecastDate: '09 Sep 2026',
    varianceDays: 12,
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, Helvetica, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '600px' }
const brand = { fontSize: '12px', letterSpacing: '1px', color: '#8a8a8a', margin: '0 0 16px' }
const bannerWarn = { backgroundColor: '#fff4e5', borderLeft: '4px solid #f08c00', padding: '8px 12px' }
const bannerDanger = { backgroundColor: '#fdecec', borderLeft: '4px solid #d32f2f', padding: '8px 12px' }
const bannerText = { margin: '0', fontSize: '12px', fontWeight: 700, letterSpacing: '1px', color: '#333333' }
const h1 = { fontSize: '20px', color: '#1a1a1a', margin: '18px 0 8px' }
const text = { fontSize: '14px', lineHeight: '22px', color: '#333333', margin: '0 0 8px' }
const hr = { borderColor: '#e6e6e6', margin: '18px 0' }
const rowStyle = { fontSize: '14px', margin: '0 0 8px', color: '#333333' }
const rowLabel = { display: 'inline-block', width: '180px', color: '#777777' }
const rowValue = { fontWeight: 600 }
const muted = { fontSize: '12px', color: '#8a8a8a', lineHeight: '18px' }
