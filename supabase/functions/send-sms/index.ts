import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const smsSchema = z.object({
  studentId: z.string().uuid().optional(),
  phoneNumber: z.string().regex(/^\+?\d{10,15}$/).optional(),
  message: z.string().min(1).max(1000),
  studentName: z.string().max(100).optional()
}).refine(data => data.studentId || data.phoneNumber, {
  message: "Either studentId or phoneNumber must be provided"
});

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestBody = await req.json();
    
    // Validate input
    const validationResult = smsSchema.safeParse(requestBody);
    if (!validationResult.success) {
      console.error("Validation error:", validationResult.error);
      return new Response(
        JSON.stringify({ error: "Invalid request data" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }
    
    const { studentId, phoneNumber, message, studentName } = validationResult.data;
    console.log("SMS Request received:", { hasStudentId: !!studentId, hasPhone: !!phoneNumber });

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let recipientPhone = phoneNumber;

    // If phone not provided but studentId is, fetch from database
    if (!recipientPhone && studentId) {
      // First try to get phone from profiles
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("parent_phone")
        .eq("user_id", studentId)
        .maybeSingle();

      console.log("Profile query result:", { profile, profileError, studentId });

      if (profile?.parent_phone) {
        recipientPhone = profile.parent_phone;
        console.log("Found phone in profiles:", recipientPhone);
      } else {
        // Try to get from attendance_records - look for registered status which has parent info
        const { data: attendance, error: attendanceError } = await supabase
          .from("attendance_records")
          .select("device_info")
          .eq("user_id", studentId)
          .eq("status", "registered")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        console.log("Attendance query result:", { attendance, attendanceError });

        if (attendance?.device_info) {
          const deviceInfo = attendance.device_info as any;
          console.log("Device info:", deviceInfo);
          // Check both possible locations for phone number
          recipientPhone = deviceInfo.metadata?.parent_phone || deviceInfo.phone_number;
          console.log("Found phone in attendance:", recipientPhone);
        }
      }
    }

    if (!recipientPhone) {
      console.error("No phone number found");
      return new Response(
        JSON.stringify({ error: "Unable to send SMS. Please contact support." }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Clean phone number (remove +91 if present, Fast2SMS adds it automatically)
    const cleanPhone = recipientPhone.replace(/^\+91/, "").replace(/\s+/g, "");
    
    // Validate Indian phone number (10 digits)
    if (!/^\d{10}$/.test(cleanPhone)) {
      console.error("Invalid phone number format");
      return new Response(
        JSON.stringify({ error: "Invalid phone number format. Please contact support." }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    console.log("Sending SMS to:", cleanPhone);

    // Send SMS using Fast2SMS API
    const fast2smsApiKey = Deno.env.get("FAST2SMS_API_KEY");
    
    if (!fast2smsApiKey) {
      console.error("Fast2SMS API key not configured");
      return new Response(
        JSON.stringify({ error: "Service temporarily unavailable. Please contact support." }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    const fast2smsUrl = `https://www.fast2sms.com/dev/bulkV2?authorization=${fast2smsApiKey}&route=q&message=${encodeURIComponent(message)}&language=english&flash=0&numbers=${cleanPhone}`;

    const smsResponse = await fetch(fast2smsUrl, {
      method: "GET",
    });

    const smsData = await smsResponse.json();
    
    console.log("Fast2SMS Response:", smsData);

    if (!smsData.return || smsData.return === false) {
      console.error("Fast2SMS API Error:", smsData);
      return new Response(
        JSON.stringify({ 
          error: "Failed to send SMS. Please try again or contact support.",
          support_id: crypto.randomUUID()
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "SMS sent successfully",
        phone: cleanPhone,
        response: smsData 
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  } catch (error: any) {
    console.error("Error in send-sms function:", error);
    return new Response(
      JSON.stringify({ 
        error: "An error occurred. Please try again or contact support.",
        support_id: crypto.randomUUID()
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
