import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const resendApiKey = Deno.env.get('RESEND_API_KEY')
const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')
const whatsappAccessToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN')
const whatsappPhoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }
  return text.replace(/[&<>"']/g, (m) => map[m])
}

function normalizePhone(phone?: string | null): string | null {
  if (!phone) return null
  let clean = phone.replace(/[\s\-()]/g, '')
  if (clean.startsWith('+')) clean = clean.slice(1)
  if (/^\d{10}$/.test(clean)) clean = `91${clean}`
  return /^\d{10,15}$/.test(clean) ? clean : null
}

async function sendEmailWithResendOrConnector(payload: {
  to: string
  subject: string
  html: string
}) {
  if (!resendApiKey) return { ok: false, error: 'Email service not configured' }

  if (resendApiKey.startsWith('re_')) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'School Alerts <noreply@presences.dev>',
        to: [payload.to],
        subject: payload.subject,
        html: payload.html,
      }),
    })

    const responseData = await response.json().catch(() => ({}))
    if (!response.ok) return { ok: false, error: responseData?.message || 'Failed to send email' }
    return { ok: true, id: responseData?.id || null }
  }

  if (!lovableApiKey) return { ok: false, error: 'Connector auth key missing' }

  const response = await fetch('https://connector-gateway.lovable.dev/resend/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${lovableApiKey}`,
      'X-Connection-Api-Key': resendApiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'School Alerts <noreply@presences.dev>',
      to: [payload.to],
      subject: payload.subject,
      html: payload.html,
    }),
  })

  const responseData = await response.json().catch(() => ({}))
  if (!response.ok) {
    return {
      ok: false,
      error: responseData?.error?.message || responseData?.message || 'Failed to send email',
    }
  }

  return { ok: true, id: responseData?.id || null }
}

async function sendWhatsAppMessage(phoneNumber: string, message: string) {
  if (!whatsappAccessToken || !whatsappPhoneNumberId) {
    return { success: false, error: 'WhatsApp API not configured' }
  }

  const formattedPhone = normalizePhone(phoneNumber)
  if (!formattedPhone) return { success: false, error: 'Invalid phone number' }

  try {
    const response = await fetch(`https://graph.facebook.com/v18.0/${whatsappPhoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${whatsappAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: formattedPhone,
        type: 'text',
        text: { body: message },
      }),
    })

    const data = await response.json().catch(() => ({}))
    if (!response.ok) return { success: false, error: data?.error?.message || 'WhatsApp send failed' }
    return { success: true, messageId: data?.messages?.[0]?.id ?? null }
  } catch (err: any) {
    return { success: false, error: err?.message || 'WhatsApp send failed' }
  }
}

function normalizePayload(raw: any) {
  const student = raw?.student && typeof raw.student === 'object'
    ? {
        id: typeof raw.student.id === 'string' ? raw.student.id : undefined,
        name: typeof raw.student.name === 'string' ? raw.student.name : undefined,
        status: typeof raw.student.status === 'string' ? raw.student.status : undefined,
      }
    : {
        id: typeof raw?.studentId === 'string' ? raw.studentId : undefined,
        name: typeof raw?.studentName === 'string' ? raw.studentName : undefined,
        status: typeof raw?.status === 'string' ? raw.status : 'notification',
      }

  const recipientObject = typeof raw?.recipient === 'object' && raw?.recipient !== null ? raw.recipient : null
  const recipientEmail = typeof raw?.recipient === 'string'
    ? raw.recipient
    : typeof recipientObject?.email === 'string'
      ? recipientObject.email
      : undefined

  const recipientName = typeof recipientObject?.name === 'string'
    ? recipientObject.name
    : typeof raw?.parentName === 'string'
      ? raw.parentName
      : undefined

  const recipientPhone = typeof recipientObject?.phone === 'string'
    ? recipientObject.phone
    : typeof raw?.phoneNumber === 'string'
      ? raw.phoneNumber
      : undefined

  const messageObject = typeof raw?.message === 'object' && raw?.message !== null ? raw.message : null
  const subject = typeof raw?.subject === 'string'
    ? raw.subject
    : typeof messageObject?.subject === 'string'
      ? messageObject.subject
      : `School Notification${student.name ? ` - ${student.name}` : ''}`

  const body = typeof raw?.message === 'string'
    ? raw.message
    : typeof messageObject?.body === 'string'
      ? messageObject.body
      : ''

  return {
    student,
    recipient: {
      email: recipientEmail,
      name: recipientName,
      phone: recipientPhone,
    },
    subject,
    body,
    targetUserId: typeof raw?.targetUserId === 'string' ? raw.targetUserId : undefined,
  }
}

async function resolveParentContact(supabaseClient: any, targetUserId?: string, studentId?: string) {
  const lookupId = targetUserId || studentId
  if (!lookupId) return null

  let { data: profile } = await supabaseClient
    .from('profiles')
    .select('parent_email, parent_name, parent_phone, phone, metadata')
    .eq('user_id', lookupId)
    .maybeSingle()

  if (!profile) {
    const byId = await supabaseClient
      .from('profiles')
      .select('parent_email, parent_name, parent_phone, phone, metadata')
      .eq('id', lookupId)
      .maybeSingle()
    profile = byId.data
  }

  if (!profile && studentId) {
    const fromRecord = await supabaseClient
      .from('attendance_records')
      .select('device_info')
      .eq('user_id', studentId)
      .order('timestamp', { ascending: false })
      .limit(1)
      .maybeSingle()

    const metadata = (fromRecord.data?.device_info as any)?.metadata || {}
    return {
      email: metadata.parent_email || null,
      phone: normalizePhone(metadata.parent_phone || null),
      name: metadata.parent_name || null,
    }
  }

  const metadata = (profile as any)?.metadata || {}
  return {
    email: profile?.parent_email || null,
    phone: normalizePhone(profile?.parent_phone || metadata?.parent_phone || profile?.phone || null),
    name: profile?.parent_name || null,
  }
}

async function storeInAppNotification(
  supabaseClient: any,
  targetUserId: string,
  title: string,
  message: string,
  type = 'attendance',
) {
  const { error } = await supabaseClient.from('notifications').insert({
    user_id: targetUserId,
    title,
    message,
    type,
    read: false,
  })
  return !error
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const [{ data: roleData }, { data: teacherData }] = await Promise.all([
      supabaseClient.from('user_roles').select('role').eq('user_id', user.id).in('role', ['admin', 'principal']).maybeSingle(),
      supabaseClient.from('teacher_permissions').select('id').eq('user_id', user.id).limit(1),
    ])

    const isAuthorized = roleData || (teacherData && teacherData.length > 0)
    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: 'Forbidden - Admin, Principal, or Teacher access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const rawBody = await req.json()
    const payload = normalizePayload(rawBody)
    if (!payload.body?.trim()) {
      return new Response(JSON.stringify({ error: 'Message body is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const parentContact = await resolveParentContact(
      supabaseClient,
      payload.targetUserId,
      payload.student.id,
    )

    const recipientEmail = payload.recipient.email || parentContact?.email || null
    const recipientPhone = normalizePhone(payload.recipient.phone || parentContact?.phone || null)
    const recipientName = payload.recipient.name || parentContact?.name || 'Parent/Guardian'

    let emailSent = false
    let emailError: string | null = null
    let emailId: string | null = null
    if (recipientEmail) {
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(payload.subject)}</title></head>
        <body style="font-family:Arial,sans-serif;line-height:1.6;margin:0;padding:0;background:#f4f4f5;">
          <table width="100%" cellpadding="0" cellspacing="0" style="padding:20px;"><tr><td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;overflow:hidden;">
              <tr><td style="padding:20px 24px;background:#1d4ed8;color:#fff;font-size:20px;font-weight:700;">School Notification</td></tr>
              <tr><td style="padding:24px;white-space:pre-line;color:#111827;">
                <p style="margin-top:0;">Dear ${escapeHtml(recipientName)},</p>
                ${escapeHtml(payload.body)}
              </td></tr>
            </table>
          </td></tr></table>
        </body>
        </html>`

      const sendResult = await sendEmailWithResendOrConnector({
        to: recipientEmail,
        subject: payload.subject,
        html: htmlContent,
      })

      if (sendResult.ok) {
        emailSent = true
        emailId = sendResult.id
      } else {
        emailError = sendResult.error || 'Email failed'
      }
    }

    let whatsappSent = false
    let whatsappError: string | null = null
    if (recipientPhone) {
      const whatsappBody = `${payload.subject}\n\n${payload.body}`
      const waResult = await sendWhatsAppMessage(recipientPhone, whatsappBody)
      whatsappSent = waResult.success
      whatsappError = waResult.success ? null : waResult.error || 'WhatsApp failed'

      await supabaseClient.from('notification_log').insert({
        recipient_phone: recipientPhone,
        recipient_id: payload.targetUserId || payload.student.id || null,
        message_content: whatsappBody,
        notification_type: 'whatsapp',
        language: 'en',
        status: waResult.success ? 'sent' : 'failed',
        gateway_response: waResult as any,
      })
    }

    let inAppNotification = false
    const notificationTargetUserId = payload.targetUserId || payload.student.id
    if (notificationTargetUserId) {
      inAppNotification = await storeInAppNotification(
        supabaseClient,
        notificationTargetUserId,
        payload.subject,
        payload.body,
        payload.student.status === 'notification' ? 'info' : 'attendance',
      )
    }

    await supabaseClient.from('notifications').insert({
      user_id: user.id,
      title: `Notification dispatch${payload.student.name ? ` • ${payload.student.name}` : ''}`,
      message: [
        emailSent ? 'Email: sent' : emailError ? `Email: ${emailError}` : 'Email: skipped',
        whatsappSent ? 'WhatsApp: sent' : whatsappError ? `WhatsApp: ${whatsappError}` : 'WhatsApp: skipped',
        inAppNotification ? 'In-app: sent' : 'In-app: skipped',
      ].join(' | '),
      type: 'notification_dispatch',
    })

    const success = emailSent || whatsappSent || inAppNotification
    return new Response(JSON.stringify({
      success,
      message: success ? 'Notification processed' : 'No channel delivered',
      channels: {
        email: { sent: emailSent, id: emailId, error: emailError },
        whatsapp: { sent: whatsappSent, error: whatsappError },
        inApp: { sent: inAppNotification },
      },
    }), {
      status: success ? 200 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    return new Response(JSON.stringify({
      error: 'Failed to send notification',
      details: error?.message || 'Unknown error',
      support_id: crypto.randomUUID(),
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})