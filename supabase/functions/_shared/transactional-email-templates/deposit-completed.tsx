/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { BRAND, fmtUSD } from './_brand.ts'

interface Props {
  amount?: number
  method?: string         // e.g. "USDT (BEP-20)", "Card", "Bank transfer"
  currency?: string       // e.g. "USD", "USDT"
  txId?: string           // on-chain hash or provider reference
  newBalance?: number
}

const DepositCompletedEmail = ({ amount, method, currency, txId, newBalance }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Deposit confirmed — {fmtUSD(amount)} credited</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={badge}>DEPOSIT</Section>
        <Heading style={h1}>✅ Deposit confirmed</Heading>
        <Text style={text}>
          Your deposit{method ? <> via <strong>{method}</strong></> : null} has been credited to your account.
        </Text>

        <Section style={card}>
          <Row label="Amount" value={fmtUSD(amount)} valueStyle={accentValue} />
          {currency ? <Row label="Currency" value={currency} /> : null}
          {method ? <Row label="Method" value={method} /> : null}
          {typeof newBalance === 'number' ? <Row label="New balance" value={fmtUSD(newBalance)} /> : null}
          {txId ? <Row label="Reference" value={txId.length > 18 ? `${txId.slice(0, 8)}…${txId.slice(-6)}` : txId} /> : null}
        </Section>

        <Button style={button} href={`${BRAND.siteUrl}/portfolio`}>View balance</Button>

        <Hr style={hr} />
        <Text style={footer}>You're receiving this because you have deposit emails enabled. — The {BRAND.siteName} team</Text>
      </Container>
    </Body>
  </Html>
)

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
  component: DepositCompletedEmail,
  subject: (d: Record<string, any>) => `Deposit confirmed — ${fmtUSD(Number(d.amount ?? 0))}`,
  displayName: 'Deposit completed',
  previewData: {
    amount: 100,
    method: 'USDT (BEP-20)',
    currency: 'USDT',
    txId: '0x1234567890abcdef1234567890abcdef',
    newBalance: 250.5,
  },
} satisfies TemplateEntry

const main = { backgroundColor: BRAND.bg, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }
const container = { padding: '32px 28px', maxWidth: '560px', margin: '0 auto' }
const badge = { display: 'inline-block', backgroundColor: BRAND.accent, color: BRAND.primaryFg, fontSize: '11px', fontWeight: 700 as const, letterSpacing: '1px', padding: '4px 10px', borderRadius: '4px', margin: '0 0 16px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: BRAND.text, margin: '0 0 12px', lineHeight: '1.25' }
const text = { fontSize: '15px', color: BRAND.textMuted, lineHeight: '1.55', margin: '0 0 20px' }
const card = { backgroundColor: BRAND.surface, border: `1px solid ${BRAND.border}`, borderRadius: '10px', padding: '16px 18px', margin: '0 0 24px' }
const rowLabel = { fontSize: '13px', color: BRAND.textMuted, padding: '4px 0' }
const rowValue = { fontSize: '14px', color: BRAND.text, fontWeight: 600 as const, textAlign: 'right' as const, padding: '4px 0' }
const accentValue = { color: BRAND.accent, fontSize: '15px', fontWeight: 700 as const }
const button = { backgroundColor: BRAND.primary, color: BRAND.primaryFg, fontSize: '14px', fontWeight: 600 as const, borderRadius: '8px', padding: '12px 22px', textDecoration: 'none', display: 'inline-block' }
const hr = { borderColor: BRAND.border, margin: '32px 0 16px' }
const footer = { fontSize: '12px', color: BRAND.textSubtle, margin: 0, lineHeight: '1.5' }
