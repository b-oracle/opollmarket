/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Html, Preview, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'opollmarket'
const SITE_URL = 'https://opollmarket.com'

interface Props {
  amount?: number
  status?: 'sent' | 'approved' | 'rejected' | 'pending'
  reason?: string
}

const WithdrawalCompletedEmail = ({ amount, status, reason }: Props) => {
  const isRejected = status === 'rejected'
  const heading = isRejected ? '❌ Withdrawal rejected' : status === 'sent' ? '🎉 Withdrawal sent' : '✅ Withdrawal update'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{heading} — ${amount?.toFixed(2) ?? '0.00'}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>{heading}</Heading>
          <Text style={text}>
            {isRejected
              ? `Your withdrawal request of $${(amount ?? 0).toFixed(2)} was not approved.`
              : `Your withdrawal of $${(amount ?? 0).toFixed(2)} has been ${status ?? 'processed'}.`}
          </Text>
          {reason && <Text style={text}>Reason: {reason}</Text>}
          <Button style={button} href={`${SITE_URL}/portfolio`}>
            View Portfolio
          </Button>
          <Text style={footer}>— The {SITE_NAME} team</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: WithdrawalCompletedEmail,
  subject: (d: Record<string, any>) =>
    d.status === 'rejected'
      ? `Withdrawal rejected — $${Number(d.amount ?? 0).toFixed(2)}`
      : `Withdrawal ${d.status ?? 'update'} — $${Number(d.amount ?? 0).toFixed(2)}`,
  displayName: 'Withdrawal completed',
  previewData: { amount: 50, status: 'sent' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0f172a', margin: '0 0 16px' }
const text = { fontSize: '15px', color: '#334155', lineHeight: '1.55', margin: '0 0 16px' }
const button = { backgroundColor: '#0f172a', color: '#ffffff', fontSize: '14px', borderRadius: '8px', padding: '12px 20px', textDecoration: 'none' }
const footer = { fontSize: '12px', color: '#94a3b8', margin: '32px 0 0' }
