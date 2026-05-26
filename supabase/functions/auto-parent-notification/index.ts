import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const whatsappAccessToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
const whatsappPhoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return text.replace(/[&<>"']/g, m => map[m]);
}

async function sendWhatsAppMessage(phone: string, message: string): Promise<{ success: boolean; error?: string }> {
  if (!whatsappAccessToken || !whatsappPhoneNumberId) return { success: false, error: 'WhatsApp API not configured' };
  let formattedPhone = phone.replace(/[\s\-\(\)]/g, '');
  if (formattedPhone.startsWith('+')) formattedPhone = formattedPhone.substring(1);
  if (/^\d{10}$/.test(formattedPhone)) formattedPhone = '91' + formattedPhone;
  try {
    const response = await fetch(`https://graph.facebook.com/v18.0/${whatsappPhoneNumberId}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${whatsappAccessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: formattedPhone, type: 'text', text: { body: message } }),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error?.message || 'WhatsApp send failed' };
    return { success: true };
  } catch (err: any) { return { success: false, error: err.message }; }
}

async function sendSMS(phone: string, message: string): Promise<{ success: boolean; error?: string }> {
  const fast2smsKey = Deno.env.get('FAST2SMS_API_KEY');
  if (!fast2smsKey) return { success: false, error: 'SMS API not configured' };
  const cleanPhone = phone.replace(/^\+91/, '').replace(/\s+/g, '');
  if (!/^\d{10}$/.test(cleanPhone)) return { success: false, error: 'Invalid phone number' };
  try {
    const resp = await fetch(`https://www.fast2sms.com/dev/bulkV2?authorization=${fast2smsKey}&route=q&message=${encodeURIComponent(message)}&language=english&flash=0&numbers=${cleanPhone}`);
    const data = await resp.json();
    return { success: !!data.return, error: data.return ? undefined : 'SMS send failed' };
  } catch (err: any) { return { success: false, error: err.message }; }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const { studentId, studentName, status, imageUrl } = await req.json();

    if (!studentId || !studentName || !status) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: profileData } = await supabaseClient
      .from('profiles')
      .select('parent_email, parent_name, phone, display_name, metadata')
      .eq('user_id', studentId)
      .maybeSingle();

    let parentEmail = profileData?.parent_email || null;
    let parentName = profileData?.parent_name || 'Parent/Guardian';
    let parentPhone = (profileData as any)?.metadata?.parent_phone || profileData?.phone || null;

    // Fallback: if profile is missing parent email, recover from latest registration metadata.
    if (!parentEmail) {
      const { data: registrationRecord } = await supabaseClient
        .from('attendance_records')
        .select('device_info, student_name')
        .eq('user_id', studentId)
        .eq('status', 'registered')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const metadata = (registrationRecord as any)?.device_info?.metadata || {};
      parentEmail = metadata?.parent_email || null;
      parentName = metadata?.parent_name || parentName;
      parentPhone = metadata?.parent_phone || parentPhone;
    }

    const results = { emailSent: false, whatsappSent: false, smsSent: false, errors: [] as string[] };
    const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    const date = new Date().toLocaleDateString('en-IN');

    // Keep one email per student+status+day via idempotency key (allows present, late and absent updates).
    const alreadyWhatsApp = false;
    const alreadySMS = false;

    // 1. SEND EMAIL (via app email infrastructure)
    if (parentEmail) {
      try {
        const statusKey = String(status).toLowerCase();
        const idempotencyKey = `attendance-parent-${studentId}-${statusKey}-${new Date().toISOString().split('T')[0]}`;
        const { data: emailInvokeData, error: emailInvokeError } = await supabaseClient.functions.invoke('send-transactional-email', {
          body: {
            templateName: 'attendance-status-parent',
            recipientEmail: parentEmail,
            idempotencyKey,
            templateData: {
              parentName,
              studentName,
              status: statusKey,
              timestamp: new Date().toLocaleString('en-IN'),
              imageUrl,
            },
          },
        });

        if (emailInvokeError || !emailInvokeData?.success) {
          results.errors.push(`Email: ${emailInvokeError?.message || 'failed'}`);
        } else {
          results.emailSent = true;
        }
      } catch (err: any) { results.errors.push(`Email: ${err.message}`); }
    }

    // 2. SEND WHATSAPP
    if (parentPhone && !alreadyWhatsApp) {
      const msg = status === 'present'
        ? `✅ Dear ${parentName}, your child ${studentName} has arrived at school at ${time}. - Presence`
        : status === 'late'
        ? `⏰ Notice: ${studentName} arrived late at school at ${time} today. - Presence`
        : `❌ Alert: ${studentName} has been marked absent today (${date}). Contact the school if unexpected. - Presence`;

      const waResult = await sendWhatsAppMessage(parentPhone, msg);
      results.whatsappSent = waResult.success;
      if (!waResult.success) results.errors.push(`WhatsApp: ${waResult.error}`);

      await supabaseClient.from('notification_log').insert({
        recipient_phone: parentPhone, recipient_id: studentId, message_content: msg,
        notification_type: 'whatsapp', language: 'en', status: waResult.success ? 'sent' : 'failed', gateway_response: waResult as any,
      });

      // 3. SMS FALLBACK
      // 3. SMS — also send alongside email/whatsapp (one per day max). User wants real-time SMS too.
      if (!alreadySMS) {
        const smsMsg = status === 'present'
          ? `Dear Parent, ${studentName} arrived at school at ${time}. - Presence`
          : status === 'late'
          ? `Dear Parent, ${studentName} arrived late at ${time}. - Presence`
          : `Dear Parent, ${studentName} is absent today (${date}). Contact school. - Presence`;
        const smsResult = await sendSMS(parentPhone, smsMsg);
        results.smsSent = smsResult.success;
        if (!smsResult.success) results.errors.push(`SMS: ${smsResult.error}`);
        await supabaseClient.from('notification_log').insert({
          recipient_phone: parentPhone, recipient_id: studentId, message_content: smsMsg,
          notification_type: 'sms', language: 'en', status: smsResult.success ? 'sent' : 'failed',
        });
      }
    }

    // 4. IN-APP NOTIFICATION
    await supabaseClient.from('notifications').insert({
      user_id: studentId,
      title: `Attendance Recorded: ${status.charAt(0).toUpperCase() + status.slice(1)}`,
      message: `Your attendance was marked as ${status} at ${time}`,
      type: 'attendance', read: false,
    });

    const channels = [results.emailSent && 'Email', results.whatsappSent && 'WhatsApp', results.smsSent && 'SMS', 'In-app'].filter(Boolean);
    return new Response(JSON.stringify({ success: true, ...results, message: `Sent via: ${channels.join(', ')}` }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: 'Failed to send notification', details: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
