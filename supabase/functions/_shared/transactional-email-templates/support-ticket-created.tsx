/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { BRAND } from './_brand.ts'

interface Props {
  ticketNumber?: number | string
  subject?: string
  category?: string
}

const SupportTicketCreatedEmail = ({ ticketNumber, subject, category }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Support ticket #{String(ticketNumber ?? '')} received</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={badge}>SUPPORT</Section>
        <Heading style={h1}>We received your request</Heading>
        <Text style={text}>
          Thanks for reaching out. Your support ticket has been created and our team will reply shortly.
        </Text>

        <Section style={card}>
          <table style={{ width: '100%', borderCollapse: 'collapse' as const }}>
            <tbody>
              <tr><td style={rowLabel}>Ticket ID</td><td style={{ ...rowValue, color: BRAND.info }}>#{String(ticketNumber ?? '—')}</td></tr>
              {subject ? <tr><td style={rowLabel}>Subject</td><td style={rowValue}>{subject}</td></tr> : null}
              {category ? <tr><td style={rowLabel}>Category</td><td style={rowValue}>{category}</td></tr> : null}
            </tbody>
          </table>
        </Section>

        <Button style={button} href={`${BRAND.siteUrl}/messages`}>View ticket</Button>

        <Hr style={hr} />
        <Text style={footer}>Reference this ticket ID in any follow-up. — The {BRAND.siteName} team</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: SupportTicketCreatedEmail,
  subject: (d: Record<string, any>) => `[#${d.ticketNumber ?? ''}] Support ticket received`,
  displayName: 'Support ticket created',
  previewData: { ticketNumber: 1042, subject: 'Cannot deposit', category: 'general' },
} satisfies TemplateEntry

const main = { backgroundColor: BRAND.bg, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }
const container = { padding: '32px 28px', maxWidth: '560px', margin: '0 auto' }
const badge = { display: 'inline-block', backgroundColor: BRAND.info, color: BRAND.primaryFg, fontSize: '11px', fontWeight: 700 as const, letterSpacing: '1px', padding: '4px 10px', borderRadius: '4px', margin: '0 0 16px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: BRAND.text, margin: '0 0 12px', lineHeight: '1.25' }
const text = { fontSize: '15px', color: BRAND.textMuted, lineHeight: '1.55', margin: '0 0 20px' }
const card = { backgroundColor: BRAND.surface, border: `1px solid ${BRAND.border}`, borderRadius: '10px', padding: '16px 18px', margin: '0 0 24px' }
const rowLabel = { fontSize: '13px', color: BRAND.textMuted, padding: '6px 0' }
const rowValue = { fontSize: '14px', color: BRAND.text, fontWeight: 600 as const, textAlign: 'right' as const, padding: '6px 0' }
const button = { backgroundColor: BRAND.primary, color: BRAND.primaryFg, fontSize: '14px', fontWeight: 600 as const, borderRadius: '8px', padding: '12px 22px', textDecoration: 'none', display: 'inline-block' }
const hr = { borderColor: BRAND.border, margin: '32px 0 16px' }
const footer = { fontSize: '12px', color: BRAND.textSubtle, margin: 0, lineHeight: '1.5' }
