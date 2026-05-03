/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { BRAND, fmtUSD } from './_brand.ts'

interface Props {
  amount?: number
  status?: 'sent' | 'approved' | 'rejected' | 'pending'
  method?: string         // e.g. "USDT (BEP-20)", "Bank transfer"
  destination?: string    // wallet/address/bank account (masked)
  fee?: number
  netAmount?: number
  reason?: string         // rejection reason
  txId?: string
  newBalance?: number
}

const STATUS_COPY: Record<string, { heading: string; badge: string; badgeColor: string; intro: string }> = {
  sent: {
    heading: '🎉 Withdrawal sent',
    badge: 'SENT',
    badgeColor: BRAND.accent,
    intro: 'Your withdrawal has been sent successfully.',
  },
  approved: {
    heading: '✅ Withdrawal approved',
    badge: 'APPROVED',
    badgeColor: BRAND.info,
    intro: 'Your withdrawal request has been approved and is being processed.',
  },
  rejected: {
    heading: '❌ Withdrawal rejected',
    badge: 'REJECTED',
    badgeColor: BRAND.danger,
    intro: 'Your withdrawal request was rejected and the funds have been returned to your balance.',
  },
  pending: {
    heading: '⏳ Withdrawal pending',
    badge: 'PENDING',
    badgeColor: BRAND.warning,
    intro: 'Your withdrawal request is queued for review.',
  },
}

const WithdrawalCompletedEmail = ({
  amount,
  status = 'sent',
  method,
  destination,
  fee,
  netAmount,
  reason,
  txId,
  newBalance,
}: Props) => {
  const copy = STATUS_COPY[status] ?? STATUS_COPY.sent
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{copy.heading} — {fmtUSD(amount)}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={{ ...badge, backgroundColor: copy.badgeColor }}>{copy.badge}</Section>
          <Heading style={h1}>{copy.heading}</Heading>
          <Text style={text}>{copy.intro}</Text>

          <Section style={card}>
            <Row label="Amount" value={fmtUSD(amount)} />
            {typeof fee === 'number' ? <Row label="Fee" value={fmtUSD(fee)} /> : null}
            {typeof netAmount === 'number' ? <Row label="Net sent" value={fmtUSD(netAmount)} valueStyle={status === 'rejected' ? undefined : accentValue} /> : null}
            {method ? <Row label="Method" value={method} /> : null}
            {destination ? <Row label="Destination" value={destination} /> : null}
            {txId ? <Row label="Reference" value={txId.length > 18 ? `${txId.slice(0, 8)}…${txId.slice(-6)}` : txId} /> : null}
            {typeof newBalance === 'number' ? <Row label="New balance" value={fmtUSD(newBalance)} /> : null}
          </Section>

          {status === 'rejected' && reason ? (
            <Section style={reasonBox}>
              <Text style={reasonLabel}>Reason</Text>
              <Text style={reasonText}>{reason}</Text>
            </Section>
          ) : null}

          <Button style={button} href={`${BRAND.siteUrl}/portfolio`}>View balance</Button>

          <Hr style={hr} />
          <Text style={footer}>You're receiving this because you have withdrawal emails enabled. — The {BRAND.siteName} team</Text>
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
  component: WithdrawalCompletedEmail,
  subject: (d: Record<string, any>) => {
    const status = (d.status as string) || 'sent'
    const head = STATUS_COPY[status]?.heading ?? 'Withdrawal update'
    return `${head} — ${fmtUSD(Number(d.amount ?? 0))}`
  },
  displayName: 'Withdrawal completed',
  previewData: {
    amount: 75,
    status: 'sent',
    method: 'USDT (BEP-20)',
    destination: '0x1234…ABCD',
    fee: 0.75,
    netAmount: 74.25,
    txId: '0xabcdef0123456789abcdef0123456789',
    newBalance: 175.5,
  },
} satisfies TemplateEntry

const main = { backgroundColor: BRAND.bg, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }
const container = { padding: '32px 28px', maxWidth: '560px', margin: '0 auto' }
const badge = { display: 'inline-block', color: BRAND.primaryFg, fontSize: '11px', fontWeight: 700 as const, letterSpacing: '1px', padding: '4px 10px', borderRadius: '4px', margin: '0 0 16px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: BRAND.text, margin: '0 0 12px', lineHeight: '1.25' }
const text = { fontSize: '15px', color: BRAND.textMuted, lineHeight: '1.55', margin: '0 0 20px' }
const card = { backgroundColor: BRAND.surface, border: `1px solid ${BRAND.border}`, borderRadius: '10px', padding: '16px 18px', margin: '0 0 24px' }
const rowLabel = { fontSize: '13px', color: BRAND.textMuted, padding: '4px 0' }
const rowValue = { fontSize: '14px', color: BRAND.text, fontWeight: 600 as const, textAlign: 'right' as const, padding: '4px 0' }
const accentValue = { color: BRAND.accent, fontSize: '15px', fontWeight: 700 as const }
const reasonBox = { backgroundColor: '#FEF2F2', border: `1px solid #FECACA`, borderRadius: '10px', padding: '12px 16px', margin: '0 0 24px' }
const reasonLabel = { fontSize: '11px', color: BRAND.danger, fontWeight: 700 as const, letterSpacing: '0.5px', margin: '0 0 4px' }
const reasonText = { fontSize: '14px', color: BRAND.text, margin: 0, lineHeight: '1.45' }
const button = { backgroundColor: BRAND.primary, color: BRAND.primaryFg, fontSize: '14px', fontWeight: 600 as const, borderRadius: '8px', padding: '12px 22px', textDecoration: 'none', display: 'inline-block' }
const hr = { borderColor: BRAND.border, margin: '32px 0 16px' }
const footer = { fontSize: '12px', color: BRAND.textSubtle, margin: 0, lineHeight: '1.5' }
