import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get all registered students
    const { data: allStudents } = await supabase
      .from('face_descriptors')
      .select('user_id, label');

    if (!allStudents?.length) {
      return new Response(JSON.stringify({ message: "No students registered" }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const alerts: string[] = [];

    for (const student of allStudents) {
      // Check attendance for last 3 days
      const { data: records } = await supabase
        .from('attendance_records')
        .select('status, timestamp')
        .eq('user_id', student.user_id)
        .gte('timestamp', threeDaysAgo.toISOString())
        .order('timestamp', { ascending: false });

      // If no records or all absent for 3+ days
      const presentDays = records?.filter(r => r.status === 'present' || r.status === 'late').length || 0;
      
      if (presentDays === 0 && records && records.length > 0) {
        // Student has been absent - notify parent
        const { data: profile } = await supabase
          .from('profiles')
          .select('parent_phone, display_name')
          .eq('user_id', student.user_id)
          .maybeSingle();

        if (profile?.parent_phone) {
          const fast2smsKey = Deno.env.get("FAST2SMS_API_KEY");
          if (fast2smsKey) {
            const name = profile.display_name || student.label || 'Your child';
            const message = `Dear Parent, ${name} has been absent for 3+ consecutive days. Please contact the school. - Presence`;
            const cleanPhone = profile.parent_phone.replace(/^\+91/, "").replace(/\s+/g, "");
            
            if (/^\d{10}$/.test(cleanPhone)) {
              const smsUrl = `https://www.fast2sms.com/dev/bulkV2?authorization=${fast2smsKey}&route=q&message=${encodeURIComponent(message)}&language=english&flash=0&numbers=${cleanPhone}`;
              await fetch(smsUrl);
              alerts.push(`Notified parent of ${name}`);
              
              await supabase.from('notification_log').insert({
                recipient_phone: cleanPhone,
                recipient_id: student.user_id,
                message_content: message,
                notification_type: 'sms',
                status: 'sent',
                language: 'en'
              });
            }
          }
        }

        // Also notify admins
        const { data: adminRoles } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('role', 'admin');

        if (adminRoles) {
          for (const admin of adminRoles) {
            await supabase.from('notifications').insert({
              user_id: admin.user_id,
              title: `📢 Consecutive Absence: ${student.label || 'Student'}`,
              message: `${student.label || 'A student'} has been absent for 3+ consecutive days.`,
              type: 'warning'
            });
          }
        }
      }
    }

    return new Response(JSON.stringify({ success: true, alerts }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Absence tracker error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
