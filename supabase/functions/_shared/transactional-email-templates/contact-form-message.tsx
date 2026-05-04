import * as React from 'npm:react@18.3.1'
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface ContactFormMessageProps {
  name?: string
  email?: string
  subject?: string
  message?: string
  submittedAt?: string
}

const ContactFormMessageEmail = ({
  name,
  email,
  subject,
  message,
  submittedAt,
}: ContactFormMessageProps) => {
  const shownTime = submittedAt || new Date().toLocaleString('en-IN')
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{`New contact message from ${name || 'visitor'}`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>📬 New Contact Form Message</Heading>
          <Section style={infoCard}>
            <Text style={infoLine}><strong>Name:</strong> {name || '-'}</Text>
            <Text style={infoLine}><strong>Email:</strong> {email || '-'}</Text>
            <Text style={infoLine}><strong>Subject:</strong> {subject || '-'}</Text>
            <Text style={infoLine}><strong>Submitted:</strong> {shownTime}</Text>
          </Section>
          <Heading as="h2" style={h2}>Message</Heading>
          <Section style={messageCard}>
            <Text style={messageText}>{message || ''}</Text>
          </Section>
          <Text style={muted}>Sent from the Presence website contact form.</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: ContactFormMessageEmail,
  to: 'rcaatl2022@gmail.com',
  subject: (data: Record<string, any>) =>
    `[Contact] ${data.subject || 'New message'} — ${data.name || 'Visitor'}`,
  displayName: 'Contact form message',
  previewData: {
    name: 'Jane Doe',
    email: 'jane@example.com',
    subject: 'Question about Presence',
    message: 'Hi, I would like to know more about your service.',
  },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily: 'Segoe UI, Roboto, Helvetica, Arial, sans-serif',
  margin: '0',
  padding: '24px',
}
const container = {
  border: '1px solid hsl(220 15% 90%)',
  borderRadius: '12px',
  padding: '24px',
}
const h1 = { margin: '0 0 16px', color: 'hsl(220 25% 10%)', fontSize: '22px' }
const h2 = { margin: '14px 0 8px', color: 'hsl(220 25% 10%)', fontSize: '16px' }
const infoCard = {
  border: '1px solid hsl(220 15% 90%)',
  borderRadius: '10px',
  backgroundColor: 'hsl(210 20% 98%)',
  padding: '12px 14px',
  marginBottom: '14px',
}
const infoLine = { color: 'hsl(220 25% 14%)', fontSize: '13px', lineHeight: '20px', margin: '0 0 6px' }
const messageCard = {
  border: '1px solid hsl(220 15% 90%)',
  borderRadius: '10px',
  padding: '12px 14px',
  marginBottom: '14px',
}
const messageText = { color: 'hsl(220 25% 14%)', fontSize: '14px', lineHeight: '22px', margin: '0', whiteSpace: 'pre-wrap' as const }
const muted = { color: 'hsl(220 15% 40%)', fontSize: '12px', lineHeight: '18px', margin: '14px 0 0' }