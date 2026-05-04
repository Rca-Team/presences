import * as React from 'npm:react@18.3.1'
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface AttendanceStatusParentProps {
  parentName?: string
  studentName?: string
  status?: 'present' | 'late' | 'absent'
  timestamp?: string
  imageUrl?: string
}

const statusMeta = (status?: string) => {
  if (status === 'late') return { label: 'Late', color: 'hsl(38 96% 30%)', bg: 'hsl(38 96% 92%)', emoji: '⏰' }
  if (status === 'absent') return { label: 'Absent', color: 'hsl(0 84% 38%)', bg: 'hsl(0 84% 93%)', emoji: '❌' }
  return { label: 'Present', color: 'hsl(152 76% 28%)', bg: 'hsl(152 76% 92%)', emoji: '✅' }
}

const LOGO_URL = 'https://presences.dev/logo.png'

const AttendanceStatusParentEmail = ({
  parentName,
  studentName,
  status,
  timestamp,
  imageUrl,
}: AttendanceStatusParentProps) => {
  const meta = statusMeta(status)
  const shownTime = timestamp || new Date().toLocaleString('en-IN')
  const shouldShowPhoto = (status === 'present' || status === 'late') && !!imageUrl

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{`${studentName || 'Student'} marked ${meta.label}`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Img src={LOGO_URL} alt="Presence Logo" width="140" height="40" style={logo} />
          <Heading style={h1}>Presence Attendance Update</Heading>
          <Text style={text}>Dear {parentName || 'Parent/Guardian'},</Text>
          <Section style={{ ...badgeBox, backgroundColor: meta.bg }}>
            <Text style={{ ...badge, color: meta.color }}>{meta.emoji} {meta.label}</Text>
          </Section>
          <Text style={textStrong}>
            {studentName || 'Your child'} has been marked <strong>{meta.label}</strong>.
          </Text>
          <Section style={infoCard}>
            <Text style={infoLine}><strong>Student:</strong> {studentName || 'Student'}</Text>
            <Text style={infoLine}><strong>Status:</strong> {meta.label}</Text>
            <Text style={infoLine}><strong>Marked at:</strong> {shownTime}</Text>
          </Section>

          {shouldShowPhoto && (
            <Section style={photoWrap}>
              <Text style={photoLabel}>Captured face image at marking time</Text>
              <Img src={imageUrl as string} alt={`${studentName || 'Student'} attendance capture`} style={photo} />
            </Section>
          )}

          <Text style={muted}>Real-time attendance alert from Presence Smart School.</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: AttendanceStatusParentEmail,
  subject: (data: Record<string, any>) => {
    const n = data.studentName || 'Student'
    const s = statusMeta(data.status).label
    return `${n} marked ${s}`
  },
  displayName: 'Attendance status for parent',
  previewData: {
    parentName: 'Parent',
    studentName: 'Rahul Sharma',
    status: 'present',
    timestamp: '02/05/2026, 08:58 AM',
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

const logo = {
  marginBottom: '14px',
}

const h1 = {
  margin: '0 0 16px',
  color: 'hsl(220 25% 10%)',
  fontSize: '22px',
}

const text = {
  color: 'hsl(220 25% 14%)',
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0 0 12px',
}

const textStrong = {
  ...text,
  fontWeight: '600',
}

const muted = {
  color: 'hsl(220 15% 40%)',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '14px 0 0',
}

const badgeBox = {
  borderRadius: '10px',
  padding: '10px 12px',
  marginBottom: '14px',
}

const badge = {
  margin: '0',
  fontSize: '13px',
  fontWeight: '700',
}

const infoCard = {
  border: '1px solid hsl(220 15% 90%)',
  borderRadius: '10px',
  backgroundColor: 'hsl(210 20% 98%)',
  padding: '12px 14px',
  marginBottom: '14px',
}

const infoLine = {
  color: 'hsl(220 25% 14%)',
  fontSize: '13px',
  lineHeight: '20px',
  margin: '0 0 6px',
}

const photoWrap = {
  marginBottom: '10px',
}

const photoLabel = {
  color: 'hsl(220 15% 40%)',
  fontSize: '12px',
  margin: '0 0 8px',
}

const photo = {
  width: '100%',
  maxWidth: '320px',
  borderRadius: '10px',
  border: '1px solid hsl(220 15% 90%)',
  objectFit: 'cover' as const,
}
