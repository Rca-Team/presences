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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Validate CRON secret for automated calls
    const cronSecret = req.headers.get('x-cron-secret');
    const expectedSecret = Deno.env.get('CRON_SECRET');
    
    // If no CRON_SECRET is set, fall back to admin user authentication
    if (expectedSecret && cronSecret !== expectedSecret) {
      // Try admin authentication as fallback
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) {
        return new Response(
          JSON.stringify({ error: 'Authentication required - provide x-cron-secret header or admin Authorization' }),
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

      // Verify admin role
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
    } else if (expectedSecret) {
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

    // Get all registered users (users who have profile data)
    const { data: profiles } = await supabaseClient
      .from('profiles')
      .select('user_id, display_name, parent_email, parent_name')
      .not('parent_email', 'is', null);

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
        try {
          const statusColor = userAttendance?.status === 'present' ? '#28a745' : userAttendance?.status === 'late' ? '#ffc107' : '#dc3545';
          const statusText = userAttendance?.status === 'present' ? 'Present ✓' : userAttendance?.status === 'late' ? 'Late ⏰' : 'Absent ✗';
          const statusBadge = userAttendance?.status === 'present' ? 'ON TIME' : userAttendance?.status === 'late' ? 'LATE ARRIVAL' : 'ABSENT';

          // Email sending temporarily disabled - Resend integration pending
          console.log('Would send email to:', profile.parent_email);
          console.log('Subject:', emailSubject);
          console.log('Status:', statusText);
          
          notificationResults.push({
            student: studentName,
            status: userAttendance?.status || 'absent',
            emailSent: false,
            error: 'Email service temporarily unavailable'
          });

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
