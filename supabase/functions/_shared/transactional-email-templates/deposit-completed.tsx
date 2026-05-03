/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Html, Preview, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'opollmarket'
const SITE_URL = 'https://opollmarket.com'

interface Props {
  amount?: number
  method?: string
}

const DepositCompletedEmail = ({ amount, method }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your deposit of ${amount?.toFixed(2) ?? '0.00'} has been credited</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>✅ Deposit confirmed</Heading>
        <Text style={text}>
          Your deposit{method ? ` via ${method}` : ''} has been credited to your account.
        </Text>
        <Text style={highlight}>
          Amount: <strong>${(amount ?? 0).toFixed(2)}</strong>
        </Text>
        <Button style={button} href={`${SITE_URL}/portfolio`}>
          View Balance
        </Button>
        <Text style={footer}>— The {SITE_NAME} team</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: DepositCompletedEmail,
  subject: (d: Record<string, any>) => `Deposit confirmed — $${Number(d.amount ?? 0).toFixed(2)}`,
  displayName: 'Deposit completed',
  previewData: { amount: 100, method: 'Crypto' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0f172a', margin: '0 0 16px' }
const text = { fontSize: '15px', color: '#334155', lineHeight: '1.55', margin: '0 0 16px' }
const highlight = { fontSize: '16px', color: '#0f172a', backgroundColor: '#ecfdf5', padding: '12px 14px', borderRadius: '8px', margin: '0 0 24px' }
const button = { backgroundColor: '#0f172a', color: '#ffffff', fontSize: '14px', borderRadius: '8px', padding: '12px 20px', textDecoration: 'none' }
const footer = { fontSize: '12px', color: '#94a3b8', margin: '32px 0 0' }
