/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { BRAND } from './_brand.ts'

interface Props {
  ticketNumber?: number | string
  subject?: string
  preview?: string
}

const SupportTicketReplyEmail = ({ ticketNumber, subject, preview }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>New reply on ticket #{String(ticketNumber ?? '')}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={badge}>NEW REPLY</Section>
        <Heading style={h1}>You have a new reply</Heading>
        <Text style={text}>
          A team member just replied to your support ticket{subject ? <> — <strong>{subject}</strong></> : null}.
        </Text>
        {preview ? (
          <Section style={quote}>
            <Text style={quoteText}>{preview}</Text>
          </Section>
        ) : null}

        <Button style={button} href={`${BRAND.siteUrl}/messages`}>Open ticket #{String(ticketNumber ?? '')}</Button>

        <Hr style={hr} />
        <Text style={footer}>— The {BRAND.siteName} team</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: SupportTicketReplyEmail,
  subject: (d: Record<string, any>) => `[#${d.ticketNumber ?? ''}] New reply on your ticket`,
  displayName: 'Support ticket reply',
  previewData: { ticketNumber: 1042, subject: 'Cannot deposit', preview: 'Hi! Could you share a screenshot of the error?' },
} satisfies TemplateEntry

const main = { backgroundColor: BRAND.bg, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }
const container = { padding: '32px 28px', maxWidth: '560px', margin: '0 auto' }
const badge = { display: 'inline-block', backgroundColor: BRAND.accent, color: BRAND.primaryFg, fontSize: '11px', fontWeight: 700 as const, letterSpacing: '1px', padding: '4px 10px', borderRadius: '4px', margin: '0 0 16px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: BRAND.text, margin: '0 0 12px', lineHeight: '1.25' }
const text = { fontSize: '15px', color: BRAND.textMuted, lineHeight: '1.55', margin: '0 0 20px' }
const quote = { backgroundColor: BRAND.surface, borderLeft: `3px solid ${BRAND.accent}`, padding: '12px 16px', margin: '0 0 24px', borderRadius: '6px' }
const quoteText = { fontSize: '14px', color: BRAND.text, lineHeight: '1.5', margin: 0, fontStyle: 'italic' as const }
const button = { backgroundColor: BRAND.primary, color: BRAND.primaryFg, fontSize: '14px', fontWeight: 600 as const, borderRadius: '8px', padding: '12px 22px', textDecoration: 'none', display: 'inline-block' }
const hr = { borderColor: BRAND.border, margin: '32px 0 16px' }
const footer = { fontSize: '12px', color: BRAND.textSubtle, margin: 0, lineHeight: '1.5' }
