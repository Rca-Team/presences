import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts"

console.log('Email notification function started');

const resendApiKey = Deno.env.get('RESEND_API_KEY');

console.log('Configuration check:', {
  hasResendKey: !!resendApiKey
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const notificationSchema = z.object({
  recipient: z.object({
    email: z.string().email().max(255),
    name: z.string().max(100).optional()
  }),
  message: z.object({
    subject: z.string().min(1).max(200),
    body: z.string().min(1).max(5000)
  }),
  student: z.object({
    id: z.string().min(1).max(100),
    name: z.string().max(100),
    status: z.enum(['present', 'late', 'absent', 'notification'])
  }).optional(),
  targetUserId: z.string().uuid().optional() // For storing notification to specific user
});

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

// Helper to store in-app notification
async function storeInAppNotification(
  supabaseClient: any,
  targetUserId: string,
  title: string,
  message: string,
  type: string = 'attendance'
) {
  try {
    const { error } = await supabaseClient
      .from('notifications')
      .insert({
        user_id: targetUserId,
        title,
        message,
        type,
        read: false
      });
    
    if (error) {
      console.error('Failed to store in-app notification:', error);
      return false;
    }
    
    console.log('In-app notification stored successfully for user:', targetUserId);
    return true;
  } catch (err) {
    console.error('Error storing in-app notification:', err);
    return false;
  }
}

serve(async (req) => {
  console.log('Received request:', req.method);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Create Supabase client with auth
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! }
        }
      }
    );

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    
    if (authError || !user) {
      console.error('Authentication failed:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Authentication required' }),
        { 
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Check if user is admin or moderator (principal)
    const { data: roleData, error: roleError } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['admin', 'moderator'])
      .maybeSingle();

    // Also check if user is a teacher with permissions
    const { data: teacherData } = await supabaseClient
      .from('teacher_permissions')
      .select('id')
      .eq('user_id', user.id)
      .limit(1);

    const isAuthorized = roleData || (teacherData && teacherData.length > 0);

    if (!isAuthorized) {
      console.error('Authorization check failed:', roleError);
      return new Response(
        JSON.stringify({ error: 'Forbidden - Admin, Principal, or Teacher access required' }),
        { 
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log('User authenticated and authorized:', user.id);
    
    const requestBody = await req.json();
    
    // Validate input
    const validationResult = notificationSchema.safeParse(requestBody);
    if (!validationResult.success) {
      console.error("Validation error:", validationResult.error);
      return new Response(
        JSON.stringify({ error: "Invalid request data", details: validationResult.error.issues }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }
    
    const { recipient, message, student, targetUserId } = validationResult.data;
    console.log("Notification request:", { recipient: recipient.email, hasStudent: !!student, targetUserId });
    
    let emailSent = false;
    let emailError: string | null = null;
    let emailId: string | null = null;

    // Try to send email if Resend is configured
    if (resendApiKey) {
      try {
        console.log('Sending email to:', recipient.email);
        
        // Determine status colors and labels
        const statusColor = student?.status === 'present' ? '#22c55e' : student?.status === 'late' ? '#eab308' : '#ef4444';
        const statusBadge = student?.status === 'present' ? 'ON TIME' : student?.status === 'late' ? 'LATE ARRIVAL' : 'ABSENT';
        const statusEmoji = student?.status === 'present' ? '✅' : student?.status === 'late' ? '⏰' : '❌';

        // Create beautiful HTML email template
        const htmlContent = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${escapeHtml(message.subject)}</title>
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; margin: 0; padding: 0; background-color: #f4f4f5;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 20px;">
              <tr>
                <td align="center">
                  <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                    <!-- Header -->
                    <tr>
                      <td style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 30px; text-align: center;">
                        <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">
                          📚 School Attendance System
                        </h1>
                      </td>
                    </tr>
                    
                    <!-- Status Badge -->
                    ${student ? `
                    <tr>
                      <td style="padding: 20px; text-align: center;">
                        <span style="display: inline-block; background-color: ${statusColor}; color: white; padding: 8px 20px; border-radius: 20px; font-weight: 600; font-size: 14px;">
                          ${statusEmoji} ${statusBadge}
                        </span>
                      </td>
                    </tr>
                    ` : ''}
                    
                    <!-- Content -->
                    <tr>
                      <td style="padding: 20px 30px;">
                        <p style="color: #374151; margin: 0 0 10px 0;">Dear ${escapeHtml(recipient.name || 'Parent/Guardian')},</p>
                        <div style="color: #4b5563; white-space: pre-line;">
                          ${escapeHtml(message.body)}
                        </div>
                      </td>
                    </tr>
                    
                    ${student ? `
                    <!-- Student Info -->
                    <tr>
                      <td style="padding: 0 30px 20px 30px;">
                        <table width="100%" style="background-color: #f9fafb; border-radius: 8px; padding: 15px;">
                          <tr>
                            <td>
                              <p style="margin: 0; color: #6b7280; font-size: 12px; text-transform: uppercase;">Student</p>
                              <p style="margin: 5px 0 0 0; color: #111827; font-weight: 600;">${escapeHtml(student.name)}</p>
                            </td>
                            <td align="right">
                              <p style="margin: 0; color: #6b7280; font-size: 12px; text-transform: uppercase;">Date & Time</p>
                              <p style="margin: 5px 0 0 0; color: #111827; font-weight: 600;">${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}</p>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    ` : ''}
                    
                    <!-- Footer -->
                    <tr>
                      <td style="background-color: #f9fafb; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
                        <p style="margin: 0; color: #6b7280; font-size: 12px;">
                          This is an automated message from the School Attendance System.
                        </p>
                        <p style="margin: 10px 0 0 0; color: #9ca3af; font-size: 11px;">
                          If you have questions, please contact the school administration.
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
          </html>
        `;

        // Send email via Resend API using verified domain
        const resendResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'School Attendance <noreply@presences.dev>',
            to: [recipient.email],
            subject: message.subject,
            html: htmlContent,
          }),
        });

        if (!resendResponse.ok) {
          const errorData = await resendResponse.json();
          console.error('Resend error:', errorData);
          emailError = errorData.message || 'Failed to send email';
        } else {
          const emailData = await resendResponse.json();
          emailId = emailData?.id;
          emailSent = true;
          console.log('Email sent successfully:', emailId);
        }
        
      } catch (err: any) {
        console.error('Email sending error:', err);
        emailError = err.message || 'Email sending failed';
      }
    } else {
      console.warn('RESEND_API_KEY not configured - will store in-app notification only');
      emailError = 'Email service not configured';
    }

    // FALLBACK: Always store in-app notification
    let inAppNotificationStored = false;
    
    // Determine the target user for in-app notification
    // If targetUserId is provided, use it; otherwise try to find user by student info
    let notificationTargetUserId = targetUserId;
    
    if (!notificationTargetUserId && student) {
      // Try to find user by student ID or name
      const { data: faceData } = await supabaseClient
        .from('face_descriptors')
        .select('user_id')
        .eq('user_id', student.id)
        .maybeSingle();
      
      if (faceData?.user_id) {
        notificationTargetUserId = faceData.user_id;
      }
    }
    
    if (notificationTargetUserId) {
      const notificationTitle = emailSent 
        ? `📧 ${message.subject}`
        : `🔔 ${message.subject}`;
      
      const notificationMessage = student 
        ? `Student: ${student.name}\nStatus: ${student.status}\n\n${message.body.substring(0, 200)}${message.body.length > 200 ? '...' : ''}`
        : message.body.substring(0, 300);
      
      inAppNotificationStored = await storeInAppNotification(
        supabaseClient,
        notificationTargetUserId,
        notificationTitle,
        notificationMessage,
        student ? 'attendance' : 'info'
      );
    }
    
    // Store admin notification record
    await supabaseClient
      .from('notifications')
      .insert({
        user_id: user.id,
        title: emailSent 
          ? `✅ Email sent to ${recipient.email}` 
          : `📱 In-app notification sent`,
        message: `Notification for student: ${student?.name || 'N/A'}${emailError ? ` (Email error: ${emailError})` : ''}`,
        type: 'email',
      });
    
    // Determine response based on what succeeded
    if (emailSent) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Email notification sent successfully',
          emailId,
          inAppNotification: inAppNotificationStored
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        } 
      );
    } else if (inAppNotificationStored) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'In-app notification stored (email delivery failed)',
          warning: emailError,
          inAppNotification: true
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        } 
      );
    } else {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Failed to deliver notification',
          details: emailError || 'Could not send email or store in-app notification'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500
        } 
      );
    }

  } catch (error: any) {
    console.error('Error sending notification:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Failed to send notification',
        details: error.message || 'Please try again or contact support',
        support_id: crypto.randomUUID()
      }),
      { 
        status: 500,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    )
  }
})