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
    const { studentId, studentName, entryTime, gateName, isLate, confidence } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Record attendance
    const status = isLate ? 'late' : 'present';
    await supabase.from('attendance_records').insert({
      user_id: studentId,
      status,
      confidence_score: confidence,
      device_info: { gate: gateName, entry_time: entryTime }
    });

    // Check if parent notification needed
    const { data: profile } = await supabase
      .from('profiles')
      .select('parent_phone, display_name')
      .eq('user_id', studentId)
      .maybeSingle();

    if (profile?.parent_phone) {
      const fast2smsKey = Deno.env.get("FAST2SMS_API_KEY");
      if (fast2smsKey) {
        const time = new Date(entryTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        const name = studentName || profile.display_name || 'Your child';
        
        const message = isLate
          ? `Dear Parent, ${name} arrived late at school at ${time} via ${gateName}. - Presence`
          : `Dear Parent, ${name} has arrived at school at ${time}. - Presence`;

        const cleanPhone = profile.parent_phone.replace(/^\+91/, "").replace(/\s+/g, "");
        
        if (/^\d{10}$/.test(cleanPhone)) {
          const smsUrl = `https://www.fast2sms.com/dev/bulkV2?authorization=${fast2smsKey}&route=q&message=${encodeURIComponent(message)}&language=english&flash=0&numbers=${cleanPhone}`;
          const smsResp = await fetch(smsUrl);
          const smsData = await smsResp.json();
          
          // Log notification
          await supabase.from('notification_log').insert({
            recipient_phone: cleanPhone,
            recipient_id: studentId,
            message_content: message,
            language: 'en',
            status: smsData.return ? 'sent' : 'failed',
            gateway_response: smsData,
            notification_type: 'sms'
          });
        }
      }
    }

    return new Response(JSON.stringify({ success: true, status }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Gate entry processor error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
