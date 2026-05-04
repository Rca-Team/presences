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

interface AttendanceAbsentCutoffParentProps {
  parentName?: string
  studentName?: string
  dateLabel?: string
  cutoffLabel?: string
}

const LOGO_URL = 'https://presences.dev/logo.png'

const AttendanceAbsentCutoffParentEmail = ({
  parentName,
  studentName,
  dateLabel,
  cutoffLabel,
}: AttendanceAbsentCutoffParentProps) => {
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{`${studentName || 'Student'} marked absent after cutoff`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Img src={LOGO_URL} alt="Presence Logo" width="140" height="40" style={logo} />
          <Heading style={h1}>Presence Absence Alert</Heading>
          <Text style={text}>Dear {parentName || 'Parent/Guardian'},</Text>
          <Text style={textStrong}>
            {studentName || 'Your child'} has been marked <strong>Absent</strong> because no attendance was recorded before cutoff time.
          </Text>
          <Section style={infoCard}>
            <Text style={infoLine}><strong>Student:</strong> {studentName || 'Student'}</Text>
            <Text style={infoLine}><strong>Date:</strong> {dateLabel || new Date().toLocaleDateString('en-IN')}</Text>
            <Text style={infoLine}><strong>Cutoff time:</strong> {cutoffLabel || '09:00 AM'}</Text>
            <Text style={infoLine}><strong>Status:</strong> Absent</Text>
          </Section>
          <Text style={muted}>Please contact school administration if this is unexpected.</Text>
          <Text style={muted}>Real-time attendance alert from Presence Smart School.</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: AttendanceAbsentCutoffParentEmail,
  subject: (data: Record<string, any>) => `${data.studentName || 'Student'} marked absent`,
  displayName: 'Absence cutoff alert for parent',
  previewData: {
    parentName: 'Parent',
    studentName: 'Priya Verma',
    dateLabel: '02/05/2026',
    cutoffLabel: '09:00 AM',
  },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily: 'Segoe UI, Roboto, Helvetica, Arial, sans-serif',
  margin: '0',
  padding: '24px',
}

const container = {
  border: '1px solid hsl(0 84% 88%)',
  borderRadius: '12px',
  padding: '24px',
  backgroundColor: 'hsl(0 84% 97%)',
}

const logo = {
  marginBottom: '14px',
}

const h1 = {
  margin: '0 0 16px',
  color: 'hsl(0 84% 38%)',
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
  margin: '0 0 8px',
}

const infoCard = {
  border: '1px solid hsl(0 84% 86%)',
  borderRadius: '10px',
  backgroundColor: '#ffffff',
  padding: '12px 14px',
  marginBottom: '14px',
}

const infoLine = {
  color: 'hsl(220 25% 14%)',
  fontSize: '13px',
  lineHeight: '20px',
  margin: '0 0 6px',
}
