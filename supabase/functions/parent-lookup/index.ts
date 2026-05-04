import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Normalize status consistently across the project
function normalizeStatus(status: string): string {
  const s = (status || '').toLowerCase().trim();
  if (s === 'unauthorized' || s.includes('present')) return 'present';
  if (s.includes('late')) return 'late';
  if (s.includes('absent')) return 'absent';
  return s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { student_id, phone } = await req.json();

    if (!student_id || !phone) {
      return new Response(
        JSON.stringify({ error: "student_id and phone are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanId = String(student_id).trim().substring(0, 50).toLowerCase();
    const cleanPhone = String(phone).trim().replace(/[^0-9]/g, "").slice(-10);

    if (cleanPhone.length < 10) {
      return new Response(
        JSON.stringify({ error: "Invalid phone number" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find registered student matching ID + phone
    const { data: registered, error: regError } = await supabase
      .from("attendance_records")
      .select("id, user_id, image_url, category, device_info")
      .eq("status", "registered");

    if (regError) throw regError;

    const matched = (registered || []).find((r: any) => {
      const di = r.device_info as any;
      const meta = di?.metadata || di || {};
      const empId = String(meta.employee_id || meta.roll_number || "").toLowerCase();
      const parentPhone = String(meta.parent_phone || meta.parentPhone || "");
      const phoneLast10 = parentPhone.replace(/[^0-9]/g, "").slice(-10);
      return empId === cleanId && phoneLast10 === cleanPhone;
    });

    if (!matched) {
      return new Response(
        JSON.stringify({ found: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const di = matched.device_info as any;
    const meta = di?.metadata || di || {};
    const empId = String(meta.employee_id || meta.roll_number || "").toLowerCase();

    // Build all possible identifiers for this student (same logic as admin calendar)
    const userIds: string[] = [matched.id];
    if (matched.user_id) userIds.push(matched.user_id);
    if (empId) userIds.push(empId);
    const uniqueIds = [...new Set(userIds)];

    // Fetch ALL attendance records matching any identifier — include unauthorized
    const queries = uniqueIds.map(uid =>
      supabase
        .from("attendance_records")
        .select("id, status, timestamp, device_info")
        .or(`user_id.eq.${uid},id.eq.${uid}`)
        .in("status", ["present", "late", "unauthorized"])
        .order("timestamp", { ascending: true })
    );

    // Also query by employee_id in metadata
    if (empId) {
      queries.push(
        supabase
          .from("attendance_records")
          .select("id, status, timestamp, device_info")
          .contains("device_info", { metadata: { employee_id: empId } })
          .in("status", ["present", "late", "unauthorized"])
          .order("timestamp", { ascending: true })
      );
    }

    // Also fetch gate entries for this student
    queries.push(
      supabase
        .from("gate_entries")
        .select("id, student_id, student_name, entry_time, entry_type")
        .eq("is_recognized", true)
        .or(uniqueIds.map(uid => `student_id.eq.${uid}`).join(","))
        .order("entry_time", { ascending: true })
    );

    const results = await Promise.all(queries);

    // Deduplicate attendance records by ID, keep earliest per day
    const seen = new Set<string>();
    const allRecords = results.slice(0, -1).flatMap(r => r.data || []).filter((r: any) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      // Skip registration records
      const rdi = r.device_info as any;
      if (rdi?.registration) return false;
      return true;
    });

    // Gate entries (last result)
    const gateEntries = results[results.length - 1]?.data || [];

    // Build per-day map: keep earliest record, normalize status, prioritize present > late
    const dayMap: Record<string, { status: string; timestamp: string }> = {};

    for (const rec of allRecords) {
      const dateKey = rec.timestamp.substring(0, 10); // yyyy-MM-dd
      const status = normalizeStatus(rec.status);
      if (status !== 'present' && status !== 'late') continue;

      if (!dayMap[dateKey]) {
        dayMap[dateKey] = { status, timestamp: rec.timestamp };
      } else {
        // Present overrides late; otherwise keep earliest
        if (status === 'present' && dayMap[dateKey].status === 'late') {
          dayMap[dateKey] = { status, timestamp: rec.timestamp };
        } else if (new Date(rec.timestamp) < new Date(dayMap[dateKey].timestamp)) {
          dayMap[dateKey] = { status, timestamp: rec.timestamp };
        }
      }
    }

    // Merge gate entries
    for (const ge of gateEntries) {
      const dateKey = ge.entry_time.substring(0, 10);
      if (!dayMap[dateKey]) {
        dayMap[dateKey] = { status: 'present', timestamp: ge.entry_time };
      }
    }

    const attendance = Object.values(dayMap).map(d => ({
      status: d.status,
      timestamp: d.timestamp,
    }));

    return new Response(
      JSON.stringify({
        found: true,
        student: {
          id: matched.id,
          name: meta.name || meta.label || "Student",
          employee_id: meta.employee_id || meta.roll_number || "N/A",
          category: matched.category || "A",
          image_url: matched.image_url || "",
        },
        attendance,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Parent lookup error:", err);
    return new Response(
      JSON.stringify({ error: "Server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
