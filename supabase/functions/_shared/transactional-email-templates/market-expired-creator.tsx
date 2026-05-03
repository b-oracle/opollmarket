/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Html, Preview, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'opollmarket'
const SITE_URL = 'https://opollmarket.com'

interface Props {
  marketTitle?: string
  marketId?: string
}

const MarketExpiredCreatorEmail = ({ marketTitle, marketId }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your market has ended and is awaiting resolution</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>⏰ Your market ended</Heading>
        <Text style={text}>
          Your market <strong>"{marketTitle ?? ''}"</strong> has reached its end date and is now awaiting resolution.
        </Text>
        <Text style={text}>
          Review the outcome and resolve it so winners can be paid out.
        </Text>
        <Button style={button} href={marketId ? `${SITE_URL}/market/${marketId}` : SITE_URL}>
          Resolve Market
        </Button>
        <Text style={footer}>— The {SITE_NAME} team</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: MarketExpiredCreatorEmail,
  subject: (d: Record<string, any>) => `Your market ended: ${d.marketTitle ?? ''}`,
  displayName: 'Market expired (creator)',
  previewData: { marketTitle: 'Will it rain in NYC tomorrow?', marketId: 'abc' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0f172a', margin: '0 0 16px' }
const text = { fontSize: '15px', color: '#334155', lineHeight: '1.55', margin: '0 0 16px' }
const button = { backgroundColor: '#0f172a', color: '#ffffff', fontSize: '14px', borderRadius: '8px', padding: '12px 20px', textDecoration: 'none' }
const footer = { fontSize: '12px', color: '#94a3b8', margin: '32px 0 0' }
