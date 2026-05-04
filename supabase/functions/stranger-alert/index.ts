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
    const { gateName, photoUrl, timestamp } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get all admin users
    const { data: adminRoles } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin');

    if (adminRoles) {
      for (const admin of adminRoles) {
        await supabase.from('notifications').insert({
          user_id: admin.user_id,
          title: '⚠️ Stranger Detected at Gate!',
          message: `An unregistered person was detected at ${gateName} at ${new Date(timestamp).toLocaleTimeString('en-IN')}. Please check immediately.`,
          type: 'alert'
        });
      }
    }

    // Log the event
    await supabase.from('notification_log').insert({
      message_content: `Stranger alert at ${gateName}`,
      notification_type: 'push',
      status: 'sent',
      language: 'en'
    });

    return new Response(JSON.stringify({ success: true, adminsNotified: adminRoles?.length || 0 }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Stranger alert error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
