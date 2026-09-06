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

interface OrderLine {
  lpoRef: string
  clientName: string
  materialType: string
  status: string
  committedDate: string
  forecastDate: string
  health: string
}

interface Props {
  weekOf?: string
  total?: number
  overdue?: number
  atRisk?: number
  onTrack?: number
  orders?: OrderLine[]
}

const Email = ({
  weekOf = '',
  total = 0,
  overdue = 0,
  atRisk = 0,
  onTrack = 0,
  orders = [],
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`Weekly delivery summary — ${total} open order(s), ${overdue} overdue`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>KINAIR · Delivery Tracker</Text>
        <Heading style={h1}>Weekly delivery summary</Heading>
        {weekOf ? <Text style={muted}>Week of {weekOf}</Text> : null}

        <Section style={statsRow}>
          <Text style={statLine}>
            <span style={statLabel}>Open orders</span>
            <span style={statValue}>{total}</span>
          </Text>
          <Text style={statLine}>
            <span style={statLabel}>Overdue</span>
            <span style={{ ...statValue, color: '#d32f2f' }}>{overdue}</span>
          </Text>
          <Text style={statLine}>
            <span style={statLabel}>At risk</span>
            <span style={{ ...statValue, color: '#b26a00' }}>{atRisk}</span>
          </Text>
          <Text style={statLine}>
            <span style={statLabel}>On track</span>
            <span style={{ ...statValue, color: '#1b7f4f' }}>{onTrack}</span>
          </Text>
        </Section>

        <Hr style={hr} />

        {orders.length === 0 ? (
          <Text style={text}>No open orders this week.</Text>
        ) : (
          orders.map((o) => (
            <Section key={o.lpoRef + o.clientName} style={card}>
              <Text style={cardTitle}>
                {o.lpoRef} — {o.clientName}
              </Text>
              <Text style={cardMeta}>
                {o.materialType} · {o.status} · {o.health}
              </Text>
              <Text style={cardMeta}>
                Committed {o.committedDate} · Forecast {o.forecastDate}
              </Text>
            </Section>
          ))
        )}

        <Hr style={hr} />
        <Text style={muted}>
          Open the Delivery Tracker in your KINAIR portal for the full timeline and follow-up log.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    `Weekly delivery summary — ${data?.total ?? 0} open order(s), ${data?.overdue ?? 0} overdue`,
  displayName: 'LPO weekly delivery summary',
  previewData: {
    weekOf: '07 Sep 2026',
    total: 3,
    overdue: 1,
    atRisk: 1,
    onTrack: 1,
    orders: [
      {
        lpoRef: 'LPO-2026-0142',
        clientName: 'Al Futtaim Engineering',
        materialType: 'FAHU',
        status: 'In Production',
        committedDate: '28 Aug 2026',
        forecastDate: '09 Sep 2026',
        health: 'Overdue 4d',
      },
      {
        lpoRef: 'LPO-2026-0155',
        clientName: 'Emaar Facilities',
        materialType: 'AIR CURTAIN',
        status: 'Awaiting Advance',
        committedDate: '20 Sep 2026',
        forecastDate: '26 Sep 2026',
        health: 'At risk +6d',
      },
      {
        lpoRef: 'LPO-2026-0160',
        clientName: 'Dubai Investments',
        materialType: 'FAN',
        status: 'Ready for Dispatch',
        committedDate: '02 Oct 2026',
        forecastDate: '29 Sep 2026',
        health: 'On track',
      },
    ],
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, Helvetica, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '600px' }
const brand = { fontSize: '12px', letterSpacing: '1px', color: '#8a8a8a', margin: '0 0 16px' }
const h1 = { fontSize: '20px', color: '#1a1a1a', margin: '0 0 4px' }
const text = { fontSize: '14px', lineHeight: '22px', color: '#333333', margin: '0 0 8px' }
const muted = { fontSize: '12px', color: '#8a8a8a', lineHeight: '18px' }
const hr = { borderColor: '#e6e6e6', margin: '18px 0' }
const statsRow = { marginTop: '16px' }
const statLine = { fontSize: '14px', margin: '0 0 6px', color: '#333333' }
const statLabel = { display: 'inline-block', width: '160px', color: '#777777' }
const statValue = { fontWeight: 700 }
const card = { borderLeft: '3px solid #e6e6e6', padding: '4px 0 4px 12px', margin: '0 0 14px' }
const cardTitle = { fontSize: '14px', fontWeight: 700, color: '#1a1a1a', margin: '0 0 4px' }
const cardMeta = { fontSize: '12px', color: '#666666', margin: '0 0 2px' }
