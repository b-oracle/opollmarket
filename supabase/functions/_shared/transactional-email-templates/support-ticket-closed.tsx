/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { BRAND } from './_brand.ts'

interface Props {
  ticketNumber?: number | string
  subject?: string
}

const SupportTicketClosedEmail = ({ ticketNumber, subject }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Ticket #{String(ticketNumber ?? '')} closed</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={badge}>CLOSED</Section>
        <Heading style={h1}>Your ticket has been closed</Heading>
        <Text style={text}>
          Ticket <strong>#{String(ticketNumber ?? '')}</strong>{subject ? <> — <strong>{subject}</strong></> : null} has been marked as closed.
          If your issue isn't fully resolved, you can open a new ticket any time.
        </Text>

        <Button style={button} href={`${BRAND.siteUrl}/messages`}>Open support</Button>

        <Hr style={hr} />
        <Text style={footer}>Thanks for using {BRAND.siteName}.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: SupportTicketClosedEmail,
  subject: (d: Record<string, any>) => `[#${d.ticketNumber ?? ''}] Your support ticket was closed`,
  displayName: 'Support ticket closed',
  previewData: { ticketNumber: 1042, subject: 'Cannot deposit' },
} satisfies TemplateEntry

const main = { backgroundColor: BRAND.bg, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }
const container = { padding: '32px 28px', maxWidth: '560px', margin: '0 auto' }
const badge = { display: 'inline-block', backgroundColor: BRAND.textSubtle, color: BRAND.primaryFg, fontSize: '11px', fontWeight: 700 as const, letterSpacing: '1px', padding: '4px 10px', borderRadius: '4px', margin: '0 0 16px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: BRAND.text, margin: '0 0 12px', lineHeight: '1.25' }
const text = { fontSize: '15px', color: BRAND.textMuted, lineHeight: '1.55', margin: '0 0 20px' }
const button = { backgroundColor: BRAND.primary, color: BRAND.primaryFg, fontSize: '14px', fontWeight: 600 as const, borderRadius: '8px', padding: '12px 22px', textDecoration: 'none', display: 'inline-block' }
const hr = { borderColor: BRAND.border, margin: '32px 0 16px' }
const footer = { fontSize: '12px', color: BRAND.textSubtle, margin: 0, lineHeight: '1.5' }
