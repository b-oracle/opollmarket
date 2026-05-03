/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { BRAND, fmtUSD } from './_brand.ts'

interface Props {
  marketTitle?: string
  marketId?: string
  endedAt?: string          // ISO string
  totalVolume?: number
  participantCount?: number
}

const fmtDate = (iso?: string) => {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}

const MarketExpiredCreatorEmail = ({
  marketTitle,
  marketId,
  endedAt,
  totalVolume,
  participantCount,
}: Props) => {
  const url = marketId ? `${BRAND.siteUrl}/market/${marketId}` : BRAND.siteUrl
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>Your market has ended and is awaiting resolution</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={badge}>ACTION REQUIRED</Section>
          <Heading style={h1}>⏰ Your market is ready to resolve</Heading>
          <Text style={text}>
            Your market <strong>"{marketTitle ?? ''}"</strong> has reached its end date and is now awaiting resolution.
            Pick the winning outcome so participants can be paid out.
          </Text>

          <Section style={card}>
            {endedAt ? <Row label="Ended" value={fmtDate(endedAt)} /> : null}
            {typeof totalVolume === 'number' ? <Row label="Total volume" value={fmtUSD(totalVolume)} /> : null}
            {typeof participantCount === 'number' ? <Row label="Participants" value={String(participantCount)} /> : null}
          </Section>

          <Button style={button} href={url}>Resolve market</Button>

          <Hr style={hr} />
          <Text style={footer}>You're receiving this because you have market-expired emails enabled. — The {BRAND.siteName} team</Text>
        </Container>
      </Body>
    </Html>
  )
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <table style={{ width: '100%', borderCollapse: 'collapse' as const, margin: '0 0 8px' }}>
    <tbody>
      <tr>
        <td style={rowLabel}>{label}</td>
        <td style={rowValue}>{value}</td>
      </tr>
    </tbody>
  </table>
)

export const template = {
  component: MarketExpiredCreatorEmail,
  subject: (d: Record<string, any>) => `Your market ended: ${d.marketTitle ?? ''}`,
  displayName: 'Market expired (creator)',
  previewData: {
    marketTitle: 'Will it rain in NYC tomorrow?',
    marketId: 'abc',
    endedAt: new Date().toISOString(),
    totalVolume: 1480.25,
    participantCount: 37,
  },
} satisfies TemplateEntry

const main = { backgroundColor: BRAND.bg, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }
const container = { padding: '32px 28px', maxWidth: '560px', margin: '0 auto' }
const badge = { display: 'inline-block', backgroundColor: BRAND.warning, color: BRAND.primaryFg, fontSize: '11px', fontWeight: 700 as const, letterSpacing: '1px', padding: '4px 10px', borderRadius: '4px', margin: '0 0 16px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: BRAND.text, margin: '0 0 12px', lineHeight: '1.25' }
const text = { fontSize: '15px', color: BRAND.textMuted, lineHeight: '1.55', margin: '0 0 20px' }
const card = { backgroundColor: BRAND.surface, border: `1px solid ${BRAND.border}`, borderRadius: '10px', padding: '16px 18px', margin: '0 0 24px' }
const rowLabel = { fontSize: '13px', color: BRAND.textMuted, padding: '4px 0' }
const rowValue = { fontSize: '14px', color: BRAND.text, fontWeight: 600 as const, textAlign: 'right' as const, padding: '4px 0' }
const button = { backgroundColor: BRAND.primary, color: BRAND.primaryFg, fontSize: '14px', fontWeight: 600 as const, borderRadius: '8px', padding: '12px 22px', textDecoration: 'none', display: 'inline-block' }
const hr = { borderColor: BRAND.border, margin: '32px 0 16px' }
const footer = { fontSize: '12px', color: BRAND.textSubtle, margin: 0, lineHeight: '1.5' }
