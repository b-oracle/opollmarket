/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { BRAND, fmtUSD } from './_brand.ts'

interface Props {
  marketTitle?: string
  marketId?: string
  outcomeLabel?: string       // resolved outcome
  yourOutcomeLabel?: string   // what the user predicted
  stake?: number              // amount user lost
  shares?: number
  avgPrice?: number
  insurancePayout?: number    // oSURE refund if any
}

const MarketLostEmail = ({
  marketTitle,
  marketId,
  outcomeLabel,
  yourOutcomeLabel,
  stake,
  shares,
  avgPrice,
  insurancePayout,
}: Props) => {
  const url = marketId ? `${BRAND.siteUrl}/market/${marketId}` : BRAND.siteUrl
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>Market resolved — your prediction didn't win this time</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={badge}>RESOLVED</Section>
          <Heading style={h1}>Market resolved</Heading>
          <Text style={text}>
            Your prediction on <strong>"{marketTitle ?? 'a market'}"</strong> didn't resolve in your favor.
            {outcomeLabel ? <> The winning outcome was <strong>{outcomeLabel}</strong>.</> : null}
          </Text>

          <Section style={card}>
            {yourOutcomeLabel ? <Row label="Your prediction" value={yourOutcomeLabel} /> : null}
            {typeof stake === 'number' ? <Row label="Stake lost" value={fmtUSD(stake)} valueStyle={dangerValue} /> : null}
            {typeof shares === 'number' && typeof avgPrice === 'number'
              ? <Row label="Position" value={`${shares.toFixed(2)} shares @ ${fmtUSD(avgPrice)}`} />
              : null}
            {typeof insurancePayout === 'number' && insurancePayout > 0
              ? <Row label="oSURE refund" value={fmtUSD(insurancePayout)} valueStyle={accentValue} />
              : null}
          </Section>

          <Text style={text}>
            Don't sweat it — the next call is right around the corner. Browse active markets and place your next prediction.
          </Text>

          <Button style={button} href={url}>View market</Button>

          <Hr style={hr} />
          <Text style={footer}>You're receiving this because you have prediction-loss emails enabled. — The {BRAND.siteName} team</Text>
        </Container>
      </Body>
    </Html>
  )
}

const Row = ({ label, value, valueStyle }: { label: string; value: string; valueStyle?: React.CSSProperties }) => (
  <table style={{ width: '100%', borderCollapse: 'collapse' as const, margin: '0 0 8px' }}>
    <tbody>
      <tr>
        <td style={rowLabel}>{label}</td>
        <td style={{ ...rowValue, ...(valueStyle ?? {}) }}>{value}</td>
      </tr>
    </tbody>
  </table>
)

export const template = {
  component: MarketLostEmail,
  subject: (d: Record<string, any>) => `Market resolved: ${d.marketTitle ?? 'your prediction'}`,
  displayName: 'Market lost',
  previewData: {
    marketTitle: 'Will ETH flip BTC?',
    outcomeLabel: 'NO',
    yourOutcomeLabel: 'YES',
    stake: 25,
    shares: 50,
    avgPrice: 0.5,
    insurancePayout: 0,
    marketId: 'abc',
  },
} satisfies TemplateEntry

const main = { backgroundColor: BRAND.bg, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }
const container = { padding: '32px 28px', maxWidth: '560px', margin: '0 auto' }
const badge = { display: 'inline-block', backgroundColor: BRAND.surfaceMuted, color: BRAND.textMuted, fontSize: '11px', fontWeight: 700 as const, letterSpacing: '1px', padding: '4px 10px', borderRadius: '4px', margin: '0 0 16px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: BRAND.text, margin: '0 0 12px', lineHeight: '1.25' }
const text = { fontSize: '15px', color: BRAND.textMuted, lineHeight: '1.55', margin: '0 0 20px' }
const card = { backgroundColor: BRAND.surface, border: `1px solid ${BRAND.border}`, borderRadius: '10px', padding: '16px 18px', margin: '0 0 24px' }
const rowLabel = { fontSize: '13px', color: BRAND.textMuted, padding: '4px 0' }
const rowValue = { fontSize: '14px', color: BRAND.text, fontWeight: 600 as const, textAlign: 'right' as const, padding: '4px 0' }
const dangerValue = { color: BRAND.danger, fontSize: '15px', fontWeight: 700 as const }
const accentValue = { color: BRAND.accent, fontSize: '15px', fontWeight: 700 as const }
const button = { backgroundColor: BRAND.primary, color: BRAND.primaryFg, fontSize: '14px', fontWeight: 600 as const, borderRadius: '8px', padding: '12px 22px', textDecoration: 'none', display: 'inline-block' }
const hr = { borderColor: BRAND.border, margin: '32px 0 16px' }
const footer = { fontSize: '12px', color: BRAND.textSubtle, margin: 0, lineHeight: '1.5' }
