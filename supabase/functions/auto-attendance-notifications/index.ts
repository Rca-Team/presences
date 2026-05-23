import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// This function is intended to be called by a CRON job or scheduled task
// It uses a secret token for authentication since JWT isn't suitable for automated tasks

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

/**
 * Read a settings row by key, returning string value or null.
 */
async function getSetting(client: any, key: string): Promise<string | null> {
  const { data } = await client
    .from('attendance_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  return data?.value ?? null;
}

function applyTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

/**
 * Send the same parent notification across every channel admin enabled
 * (email / in-app / SMS). All channels are best-effort — one failing
 * channel does not block the others.
 */
async function fanOutNotification(client: any, n: {
  userId: string; studentName: string; parentName: string;
  parentEmail: string | null; parentPhone: string | null;
  class: string; section: string;
  status: string; time: string; date: string; cutoff: string;
  subject: string; body: string;
}) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  // Channel toggles
  let channels = { email: true, inapp: true, sms: false };
  const raw = await getSetting(client, 'notify_channels');
  if (raw) { try { channels = { ...channels, ...JSON.parse(raw) }; } catch { /* ignore */ } }

  // Admin-editable templates
  const tplKey = n.status === 'present' ? 'msg_template_present'
               : n.status === 'late'    ? 'msg_template_late'
               : 'msg_template_absent';
  const tpl = (await getSetting(client, tplKey)) || n.body;
  const smsBody = applyTemplate(tpl, {
    parent: n.parentName, student: n.studentName,
    class: n.class, section: n.section,
    time: n.time, date: n.date, cutoff: n.cutoff,
  });

  // 1) In-app notification
  if (channels.inapp) {
    try {
      await client.from('notifications').insert({
        user_id: n.userId,
        title: n.subject,
        message: smsBody,
        type: `attendance_${n.status}`,
        metadata: { status: n.status, date: n.date, time: n.time },
      });
    } catch (e) { console.error('inapp failed', e); }
  }

  // 2) Email via existing transactional email pipeline
  if (channels.email && n.parentEmail) {
    try {
      await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          to: n.parentEmail,
          template: 'attendance-status-parent',
          data: {
            parentName: n.parentName,
            studentName: n.studentName,
            status: n.status,
            time: n.time,
            date: n.date,
            class: n.class,
            section: n.section,
            subject: n.subject,
            body: n.body,
          },
        }),
      });
    } catch (e) { console.error('email failed', e); }
  }

  // 3) SMS via Twilio (credentials stored in attendance_settings)
  if (channels.sms && n.parentPhone) {
    const sid   = await getSetting(client, 'twilio_account_sid');
    const token = await getSetting(client, 'twilio_auth_token');
    const from  = await getSetting(client, 'twilio_from_number');
    if (sid && token && from) {
      try {
        const auth = btoa(`${sid}:${token}`);
        const res = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${auth}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({ To: n.parentPhone, From: from, Body: smsBody }),
          },
        );
        if (!res.ok) console.error('twilio failed', res.status, await res.text());
      } catch (e) { console.error('sms failed', e); }
    }
  }

  // Log every fan-out for the admin notifications panel
  try {
    await client.from('notification_log').insert({
      user_id: n.userId,
      channel: Object.entries(channels).filter(([,v]) => v).map(([k]) => k).join(','),
      event_type: `attendance_${n.status}`,
      payload: { subject: n.subject, body: smsBody },
      status: 'sent',
      sent_at: new Date().toISOString(),
    });
  } catch (e) { console.error('log failed', e); }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const expectedSecret = Deno.env.get('CRON_SECRET') ?? '';
    const cronSecret = req.headers.get('x-cron-secret') ?? '';
    const authHeader = req.headers.get('Authorization');

    if (!expectedSecret && !authHeader) {
      return new Response(
        JSON.stringify({ error: 'Server is not securely configured for this endpoint.' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cronAuthorized = !!expectedSecret && cronSecret === expectedSecret;

    if (!cronAuthorized) {
      if (!authHeader) {
        return new Response(
          JSON.stringify({ error: 'Authentication required - provide x-cron-secret or admin Authorization' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
      const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

      const authClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } }
      });

      const { data: { user }, error: authError } = await authClient.auth.getUser();
      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: 'Invalid authentication token' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const serviceClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
      const { data: roleData } = await serviceClient
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .single();

      if (!roleData) {
        return new Response(
          JSON.stringify({ error: 'Admin access required' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`Admin user ${user.id} triggered auto-notifications`);
    } else {
      console.log('CRON job triggered auto-notifications');
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get cutoff time setting
    const { data: cutoffData } = await supabaseClient
      .from('attendance_settings')
      .select('value')
      .eq('key', 'cutoff_time')
      .single();

    if (!cutoffData) {
      throw new Error('Cutoff time not configured');
    }

    const cutoffTime = cutoffData.value;
    const today = new Date().toISOString().split('T')[0];

    // Pilot mode: restrict to a single class+section if enabled
    const { data: pilotRows } = await supabaseClient
      .from('attendance_settings')
      .select('key,value')
      .in('key', ['pilot_enabled', 'pilot_class', 'pilot_section']);
    const pilotMap = new Map<string, string>((pilotRows || []).map((r: any) => [r.key, r.value ?? '']));
    const pilotEnabled = (pilotMap.get('pilot_enabled') || 'false') === 'true';
    const pilotClass = pilotMap.get('pilot_class') || '';
    const pilotSection = pilotMap.get('pilot_section') || '';

    // Get all registered users (users who have profile data)
    let profilesQuery = supabaseClient
      .from('profiles')
      .select('user_id, display_name, parent_email, parent_name, class, section, phone, metadata')
      .not('parent_email', 'is', null);
    if (pilotEnabled && pilotClass && pilotSection) {
      profilesQuery = profilesQuery.eq('class', pilotClass).eq('section', pilotSection);
      console.log(`[pilot] Restricting auto-notifications to class=${pilotClass} section=${pilotSection}`);
    }
    const { data: profiles } = await profilesQuery;

    if (!profiles || profiles.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No registered users with parent emails found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get today's attendance records for all users
    const { data: todayAttendance } = await supabaseClient
      .from('attendance_records')
      .select('user_id, status, timestamp, device_info')
      .gte('timestamp', `${today}T00:00:00`)
      .lte('timestamp', `${today}T23:59:59`)
      .neq('status', 'pending_approval');

    const notificationResults = [];

    for (const profile of profiles) {
      const userId = profile.user_id;
      const studentName = profile.display_name || 'Student';

      if (!profile.parent_email) {
        console.log(`No parent email for ${studentName}`);
        continue;
      }

      // Find user's attendance record for today
      const userAttendance = todayAttendance?.find(a => a.user_id === userId);

      let emailSubject = '';
      let emailBody = '';
      let attendanceTime = '';
      let attendanceDate = '';

      if (!userAttendance) {
        // Absent - no record for today
        attendanceDate = new Date().toLocaleDateString();
        emailSubject = `Absence Alert - ${studentName}`;
        emailBody = `Dear ${profile.parent_name || 'Parent/Guardian'},\n\nThis is to inform you that ${studentName} was marked absent today.\n\nDate: ${attendanceDate}\n\nIf this is unexpected, please contact the school immediately.\n\nBest regards,\nSchool Administration`;
      } else if (userAttendance.status === 'late') {
        // Late arrival - use actual timestamp from record
        const recordTimestamp = new Date(userAttendance.timestamp);
        attendanceTime = recordTimestamp.toLocaleTimeString();
        attendanceDate = recordTimestamp.toLocaleDateString();
        emailSubject = `Late Arrival Notification - ${studentName}`;
        emailBody = `Dear ${profile.parent_name || 'Parent/Guardian'},\n\nThis is to inform you that ${studentName} arrived late to school.\n\nTime: ${attendanceTime}\nDate: ${attendanceDate}\n\nPlease ensure punctuality in the future.\n\nBest regards,\nSchool Administration`;
      } else if (userAttendance.status === 'present') {
        // Present - on time - use actual timestamp from record
        const recordTimestamp = new Date(userAttendance.timestamp);
        attendanceTime = recordTimestamp.toLocaleTimeString();
        attendanceDate = recordTimestamp.toLocaleDateString();
        emailSubject = `Attendance Confirmation - ${studentName}`;
        emailBody = `Dear ${profile.parent_name || 'Parent/Guardian'},\n\nThis is to inform you that ${studentName} has arrived at school safely.\n\nTime: ${attendanceTime}\nDate: ${attendanceDate}\n\nBest regards,\nSchool Administration`;
      }

      if (emailBody) {
        const status = userAttendance?.status || 'absent';
        try {
          const parentPhone = (profile as any).metadata?.parent_phone || profile.phone || null;
          await fanOutNotification(supabaseClient, {
            userId,
            studentName,
            parentName: profile.parent_name || 'Parent/Guardian',
            parentEmail: profile.parent_email,
            parentPhone,
            class: profile.class || '',
            section: profile.section || '',
            status,
            time: attendanceTime,
            date: attendanceDate,
            cutoff: cutoffTime,
            subject: emailSubject,
            body: emailBody,
          });
          notificationResults.push({ student: studentName, status, sent: true });
        } catch (error) {
          console.error(`Failed to send email for ${studentName}:`, error);
          notificationResults.push({
            student: studentName,
            status: userAttendance?.status || 'absent',
            emailSent: false,
            error: (error as Error).message
          });
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Automatic notifications processed',
        results: notificationResults
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in auto-notifications:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Notification service error',
        support_id: crypto.randomUUID()
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
})
