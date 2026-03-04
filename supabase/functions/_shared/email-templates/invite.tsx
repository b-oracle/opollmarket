/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({
  siteName,
  siteUrl,
  confirmationUrl,
}: InviteEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You've been invited to OPOLL — predict outcomes & win big</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img
          src="https://dqtjuhqndncanfwgjwva.supabase.co/storage/v1/object/public/email-assets/logo.png"
          width="48"
          height="48"
          alt="OPOLL"
          style={{ marginBottom: '24px' }}
        />
        <Heading style={h1}>You're invited! 🎉</Heading>
        <Text style={text}>
          Someone thinks you'd love{' '}
          <Link href={siteUrl} style={link}>
            <strong>OPOLL</strong>
          </Link>
          — swipe through markets, predict outcomes, and win big. Accept the
          invite to get started.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Accept Invitation
        </Button>
        <Text style={footer}>
          If you weren't expecting this invitation, you can safely ignore this
          email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail

const main = { backgroundColor: '#ffffff', fontFamily: "'Space Grotesk', Arial, sans-serif" }
const container = { padding: '32px 28px' }
const h1 = {
  fontSize: '24px',
  fontWeight: 'bold' as const,
  color: '#171a1f',
  margin: '0 0 20px',
}
const text = {
  fontSize: '14px',
  color: '#6b6e75',
  lineHeight: '1.6',
  margin: '0 0 24px',
}
const link = { color: '#02C7FC', textDecoration: 'underline' }
const button = {
  backgroundColor: '#02C7FC',
  color: '#0a0c0f',
  fontSize: '14px',
  fontWeight: 'bold' as const,
  borderRadius: '12px',
  padding: '14px 24px',
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: '#999999', margin: '32px 0 0' }
