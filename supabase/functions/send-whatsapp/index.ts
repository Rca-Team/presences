import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sendWhatsAppMessage(
  phoneNumber: string,
  message: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");

  if (!accessToken || !phoneNumberId) {
    return { success: false, error: "WhatsApp API not configured" };
  }

  let formattedPhone = phoneNumber.replace(/[\s\-\(\)]/g, "");
  if (formattedPhone.startsWith("+")) formattedPhone = formattedPhone.substring(1);
  if (/^\d{10}$/.test(formattedPhone)) formattedPhone = "91" + formattedPhone;

  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: formattedPhone,
          type: "text",
          text: { body: message },
        }),
      }
    );

    const data = await response.json();
    if (!response.ok) {
      return { success: false, error: data.error?.message || "WhatsApp API request failed" };
    }
    return { success: true, messageId: data.messages?.[0]?.id };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { phoneNumber, studentId, studentName, message, status } = await req.json();

    let recipientPhone = phoneNumber;

    if (!recipientPhone && studentId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("parent_phone")
        .eq("user_id", studentId)
        .maybeSingle();
      recipientPhone = profile?.parent_phone;
    }

    if (!recipientPhone) {
      return new Response(
        JSON.stringify({ success: false, error: "No phone number found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const finalMessage = message || buildAutoMessage(studentName || "Student", status || "present");

    const result = await sendWhatsAppMessage(recipientPhone, finalMessage);

    await supabase.from("notification_log").insert({
      recipient_phone: recipientPhone,
      recipient_id: studentId || null,
      message_content: finalMessage,
      notification_type: "whatsapp",
      language: "en",
      status: result.success ? "sent" : "failed",
      gateway_response: result as any,
    });

    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function buildAutoMessage(studentName: string, status: string): string {
  const time = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  const date = new Date().toLocaleDateString("en-IN");

  switch (status) {
    case "present":
      return `✅ Dear Parent, ${studentName} has arrived at school at ${time}. Have a great day! - Presence`;
    case "late":
      return `⏰ Notice: ${studentName} arrived late at school at ${time} today. Please ensure timely arrival. - Presence`;
    case "absent":
      return `❌ Alert: ${studentName} has been marked absent today (${date}). If unexpected, please contact the school. - Presence`;
    default:
      return `📚 Attendance update for ${studentName}: ${status} | Time: ${time} | Date: ${date} - Presence`;
  }
}
