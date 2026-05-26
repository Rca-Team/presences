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
          <Section style={topLine} />
          <Img src={LOGO_URL} alt="Presence Logo" width="140" height="40" style={logo} />
          <Heading style={h1}>Attendance Cutoff Alert</Heading>
          <Text style={text}>Hello {parentName || 'Parent/Guardian'},</Text>

          <Section style={alertCard}>
            <Text style={alertBadge}>❌ Absent</Text>
            <Text style={alertTitle}>{studentName || 'Your child'} was not marked before cutoff</Text>
            <Text style={alertSub}>Please review with school administration if needed.</Text>
          </Section>

          <Section style={infoCard}>
            <Text style={infoLabel}>Student</Text>
            <Text style={infoValue}>{studentName || 'Student'}</Text>
            <Section style={divider} />
            <Text style={infoLabel}>Date</Text>
            <Text style={infoValue}>{dateLabel || new Date().toLocaleDateString('en-IN')}</Text>
            <Section style={divider} />
            <Text style={infoLabel}>Cutoff time</Text>
            <Text style={infoValue}>{cutoffLabel || '09:00 AM'}</Text>
            <Section style={divider} />
            <Text style={infoLabel}>Status</Text>
            <Text style={{ ...infoValue, color: 'hsl(0 84% 38%)' }}>Absent</Text>
          </Section>
          <Text style={muted}>This is an automated realtime update from your school attendance system.</Text>
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
  fontFamily: 'Inter, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
  margin: '0',
  padding: '18px',
}

const container = {
  border: '1px solid hsl(220 20% 88%)',
  borderRadius: '14px',
  padding: '24px',
  backgroundColor: '#ffffff',
}

const topLine = {
  height: '4px',
  width: '100%',
  borderRadius: '999px',
  backgroundColor: 'hsl(0 84% 56%)',
  marginBottom: '16px',
}

const logo = {
  marginBottom: '14px',
}

const h1 = {
  margin: '0 0 16px',
  color: 'hsl(220 25% 10%)',
  fontSize: '24px',
  letterSpacing: '0',
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
  margin: '16px 0 0',
}

const alertCard = {
  border: '1px solid hsl(0 84% 86%)',
  borderRadius: '12px',
  padding: '14px',
  backgroundColor: 'hsl(0 84% 97%)',
  marginBottom: '14px',
}

const alertBadge = {
  margin: '0 0 10px',
  display: 'inline-block',
  fontSize: '12px',
  fontWeight: '700',
  color: 'hsl(0 84% 38%)',
  backgroundColor: 'hsl(0 84% 92%)',
  padding: '5px 10px',
  borderRadius: '999px',
}

const alertTitle = {
  margin: '0 0 4px',
  fontSize: '16px',
  fontWeight: '700',
  color: 'hsl(220 25% 10%)',
}

const alertSub = {
  margin: '0',
  fontSize: '12px',
  color: 'hsl(220 15% 40%)',
}

const infoCard = {
  border: '1px solid hsl(220 20% 88%)',
  borderRadius: '10px',
  backgroundColor: '#ffffff',
  padding: '12px 14px',
  marginBottom: '14px',
}

const infoLabel = {
  color: 'hsl(220 15% 40%)',
  fontSize: '11px',
  fontWeight: '600',
  margin: '0 0 2px',
}

const infoValue = {
  color: 'hsl(220 25% 12%)',
  fontSize: '14px',
  fontWeight: '600',
  margin: '0',
}

const divider = {
  borderBottom: '1px solid hsl(220 20% 92%)',
  margin: '10px 0',
}
