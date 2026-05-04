
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Default cutoff time settings
const DEFAULT_CUTOFF_HOUR = 9;  // 9 AM
const DEFAULT_CUTOFF_MINUTE = 0;

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  
  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )
    
    const { operation, userId, cutoffTime } = await req.json()
    
    // Operations that require admin authentication
    const adminOperations = ['updateAttendanceCutoffTime'];
    
    if (adminOperations.includes(operation)) {
      // Verify user is authenticated
      const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
      
      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized - Authentication required' }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 401,
          }
        );
      }

      // Check if user is admin
      const { data: roleData, error: roleError } = await supabaseClient
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .single();

      if (roleError || !roleData) {
        return new Response(
          JSON.stringify({ error: 'Forbidden - Admin access required' }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 403,
          }
        );
      }
    }
    
    // Health check endpoint for model status
    if (operation === 'healthCheck') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          message: 'Face recognition service is running',
          timestamp: new Date().toISOString()
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    }
    
    // Get attendance cutoff time setting
    if (operation === 'getAttendanceCutoffTime') {
      try {
        // First, check if we have a dedicated attendance_settings table
        let { data: settingsData, error: settingsError } = await supabaseClient
          .from('attendance_settings')
          .select('*')
          .eq('key', 'cutoff_time')
          .single();
        
        // If we get an error because the table doesn't exist, create it
        if (settingsError && settingsError.code === 'PGRST116') {
          console.log('Creating attendance_settings table...');
          
          // Attempt to create the table
          const { error: createTableError } = await supabaseClient.rpc('create_attendance_settings_table');
          
          if (createTableError) {
            console.error('Error creating attendance_settings table:', createTableError);
            // Return default settings if we can't create the table
            return new Response(
              JSON.stringify({
                hour: DEFAULT_CUTOFF_HOUR,
                minute: DEFAULT_CUTOFF_MINUTE
              }),
              {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
              }
            )
          }
          
          // Insert default settings
          const { data: insertData, error: insertError } = await supabaseClient
            .from('attendance_settings')
            .insert({
              key: 'cutoff_time',
              value: JSON.stringify({ hour: DEFAULT_CUTOFF_HOUR, minute: DEFAULT_CUTOFF_MINUTE })
            })
            .select();
          
          if (insertError) {
            console.error('Error inserting default settings:', insertError);
            return new Response(
              JSON.stringify({
                hour: DEFAULT_CUTOFF_HOUR,
                minute: DEFAULT_CUTOFF_MINUTE
              }),
              {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
              }
            )
          }
          
          settingsData = insertData?.[0];
        } else if (settingsError) {
          console.error('Error fetching cutoff time settings:', settingsError);
          return new Response(
            JSON.stringify({
              hour: DEFAULT_CUTOFF_HOUR,
              minute: DEFAULT_CUTOFF_MINUTE
            }),
            {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 200,
            }
          )
        }
        
        let cutoffHour = DEFAULT_CUTOFF_HOUR;
        let cutoffMinute = DEFAULT_CUTOFF_MINUTE;
        
        if (settingsData && settingsData.value) {
          try {
            const settings = typeof settingsData.value === 'string' 
              ? JSON.parse(settingsData.value)
              : settingsData.value;
              
            cutoffHour = settings.hour ?? DEFAULT_CUTOFF_HOUR;
            cutoffMinute = settings.minute ?? DEFAULT_CUTOFF_MINUTE;
          } catch (e) {
            console.error('Error parsing cutoff time settings:', e);
          }
        }
        
        return new Response(
          JSON.stringify({
            hour: cutoffHour,
            minute: cutoffMinute
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          }
        )
      } catch (error) {
        console.error('Error in getAttendanceCutoffTime:', error);
        return new Response(
          JSON.stringify({
            hour: DEFAULT_CUTOFF_HOUR,
            minute: DEFAULT_CUTOFF_MINUTE,
        error: (error as Error).message
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          }
        )
      }
    }
    
    // Update attendance cutoff time
    if (operation === 'updateAttendanceCutoffTime' && cutoffTime) {
      const { hour, minute } = cutoffTime;
      
      // Validate inputs
      if (typeof hour !== 'number' || hour < 0 || hour > 23 || 
          typeof minute !== 'number' || minute < 0 || minute > 59) {
        return new Response(
          JSON.stringify({ error: 'Invalid cutoff time values' }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
          }
        )
      }
      
      try {
        // First check if the table exists
        let { data: tableExists, error: tableCheckError } = await supabaseClient
          .from('attendance_settings')
          .select('count(*)', { count: 'exact', head: true });
        
        // Create table if it doesn't exist
        if (tableCheckError && tableCheckError.code === 'PGRST116') {
          const { error: createTableError } = await supabaseClient.rpc('create_attendance_settings_table');
          
          if (createTableError) {
            throw new Error(`Failed to create attendance_settings table: ${createTableError.message}`);
          }
        }
        
        // Update or insert cutoff time setting
        const { data, error } = await supabaseClient
          .from('attendance_settings')
          .upsert(
            {
              key: 'cutoff_time',
              value: JSON.stringify({ hour, minute })
            },
            { onConflict: 'key' }
          )
          .select();
        
        if (error) {
          throw new Error(`Error updating attendance cutoff time: ${error.message}`);
        }
        
        return new Response(
          JSON.stringify({
            success: true,
            message: 'Attendance cutoff time updated successfully',
            data
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          }
        )
      } catch (error) {
        console.error('Error updating cutoff time:', error);
        return new Response(
          JSON.stringify({ 
            success: false,
            error: (error as Error).message
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
          }
        )
      }
    }
    
    // Track attendance count for a specific user
    if (operation === 'getUserAttendanceCount' && userId) {
      // Get attendance count for the specific user
      const { data: attendanceData, error: attendanceError } = await supabaseClient
        .from('attendance_records')
        .select('id')
        .eq('user_id', userId)
        .eq('status', 'present');
      
      if (attendanceError) throw attendanceError;
      
      return new Response(
        JSON.stringify({
          count: attendanceData?.length || 0,
          userId: userId
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    }
    
    // Sample function to get attendance statistics
    if (operation === 'getAttendanceStats') {
      const today = new Date().toISOString().split('T')[0]
      
      // Get total employees
      const { data: employeesData, error: employeesError } = await supabaseClient
        .from('employees')
        .select('id')
      
      if (employeesError) throw employeesError
      
      const totalEmployees = employeesData?.length || 0
      
      // Get present employees today
      const { data: presentData, error: presentError } = await supabaseClient
        .from('attendance_dates')
        .select('id')
        .eq('date', today)
      
      if (presentError) throw presentError
      
      const presentEmployees = presentData?.length || 0
      
      // Get late employees today
      const { data: lateData, error: lateError } = await supabaseClient
        .from('attendance_records')
        .select('id')
        .eq('status', 'late')
        .gte('timestamp', `${today}T00:00:00`)
        .lte('timestamp', `${today}T23:59:59`)
      
      if (lateError) throw lateError
      
      const lateEmployees = lateData?.length || 0
      
      // Calculate absent employees
      const absentEmployees = Math.max(0, totalEmployees - presentEmployees)
      
      return new Response(
        JSON.stringify({
          present: presentEmployees,
          late: lateEmployees,
          absent: absentEmployees,
          total: totalEmployees,
          presentPercentage: totalEmployees > 0 ? Math.round((presentEmployees / totalEmployees) * 100) : 0,
          latePercentage: totalEmployees > 0 ? Math.round((lateEmployees / totalEmployees) * 100) : 0,
          absentPercentage: totalEmployees > 0 ? Math.round((absentEmployees / totalEmployees) * 100) : 0,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    }
    
    // Handler for future operations
    
    return new Response(
      JSON.stringify({ error: 'Unknown operation' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  } catch (error) {
    console.error('Face recognition function error:', error);
    
    return new Response(
      JSON.stringify({ 
        error: (error as Error).message,
        timestamp: new Date().toISOString(),
        details: (error as Error).stack
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})
