/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Html, Preview, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'opollmarket'
const SITE_URL = 'https://opollmarket.com'

interface Props {
  marketTitle?: string
  payoutAmount?: number
  marketId?: string
}

const MarketWonEmail = ({ marketTitle, payoutAmount, marketId }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You won! ${payoutAmount?.toFixed(2) ?? '0.00'} credited</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>🎉 You won!</Heading>
        <Text style={text}>
          Great call. Your prediction on <strong>"{marketTitle ?? 'a market'}"</strong> resolved in your favor.
        </Text>
        <Text style={highlight}>
          Payout credited: <strong>${(payoutAmount ?? 0).toFixed(2)}</strong>
        </Text>
        <Button style={button} href={marketId ? `${SITE_URL}/market/${marketId}` : SITE_URL}>
          View Market
        </Button>
        <Text style={footer}>— The {SITE_NAME} team</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: MarketWonEmail,
  subject: (d: Record<string, any>) => `🎉 You won $${Number(d.payoutAmount ?? 0).toFixed(2)} on ${d.marketTitle ?? 'your prediction'}`,
  displayName: 'Market won',
  previewData: { marketTitle: 'Will BTC hit $100k by EOY?', payoutAmount: 142.50, marketId: 'abc' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { fontSize: '24px', fontWeight: 'bold' as const, color: '#0f172a', margin: '0 0 16px' }
const text = { fontSize: '15px', color: '#334155', lineHeight: '1.55', margin: '0 0 16px' }
const highlight = { fontSize: '16px', color: '#0f172a', backgroundColor: '#ecfdf5', padding: '12px 14px', borderRadius: '8px', margin: '0 0 24px' }
const button = { backgroundColor: '#0f172a', color: '#ffffff', fontSize: '14px', borderRadius: '8px', padding: '12px 20px', textDecoration: 'none' }
const footer = { fontSize: '12px', color: '#94a3b8', margin: '32px 0 0' }
