import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type BackupPayload = {
  version: string;
  createdAt: string;
  authUsers: Array<Record<string, unknown>>;
  tables: Record<string, Array<Record<string, unknown>>>;
  storage: Record<string, Array<{ path: string; contentType: string | null; base64: string }>>;
};

const FACE_BUCKETS = ["student-registration-faces", "attendance-training-faces"];

const DELETE_ORDER = [
  "zone_entries",
  "wellness_scores",
  "student_badges",
  "notifications",
  "notification_log",
  "late_entries",
  "gate_entries",
  "face_descriptors",
  "emergency_events",
  "class_leaderboard",
  "attendance_points",
  "attendance_predictions",
  "attendance_records",
  "substitutions",
  "teacher_permissions",
  "class_teachers",
  "period_timings",
  "subjects",
  "timetable",
  "profiles",
  "user_roles",
] as const;

const RESTORE_ORDER = [
  "profiles",
  "user_roles",
  "subjects",
  "period_timings",
  "class_teachers",
  "teacher_permissions",
  "attendance_records",
  "attendance_points",
  "attendance_predictions",
  "class_leaderboard",
  "emergency_events",
  "face_descriptors",
  "gate_entries",
  "late_entries",
  "notification_log",
  "notifications",
  "student_badges",
  "substitutions",
  "wellness_scores",
  "zone_entries",
] as const;

function toBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

async function listAllStoragePaths(
  svc: ReturnType<typeof createClient>,
  bucket: string,
  prefix = "",
): Promise<string[]> {
  const paths: string[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await svc.storage.from(bucket).list(prefix, {
      limit: 100,
      offset,
      sortBy: { column: "name", order: "asc" },
    });

    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const item of data) {
      const name = item.name;
      const fullPath = prefix ? `${prefix}/${name}` : name;
      const isFolder = !item.id || item.metadata === null;

      if (isFolder) {
        const nested = await listAllStoragePaths(svc, bucket, fullPath);
        paths.push(...nested);
      } else {
        paths.push(fullPath);
      }
    }

    if (data.length < 100) break;
    offset += 100;
  }

  return paths;
}

async function requireAdmin(req: Request) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization");

  if (!authHeader) throw new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser();

  if (userError || !user) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const svc = createClient(supabaseUrl, serviceKey);
  const { data: roleData, error: roleError } = await svc
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();

  if (roleError) throw roleError;
  if (!roleData) {
    throw new Response(JSON.stringify({ error: "Admin access required" }), { status: 403 });
  }

  return { svc, callerUserId: user.id };
}

async function exportBackup(svc: ReturnType<typeof createClient>) {
  const authUsers: Array<Record<string, unknown>> = [];
  let page = 1;
  const perPage = 500;

  while (true) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const users = data?.users || [];
    authUsers.push(
      ...users.map((u) => ({
        id: u.id,
        email: u.email,
        phone: u.phone,
        app_metadata: u.app_metadata,
        user_metadata: u.user_metadata,
        email_confirmed_at: u.email_confirmed_at,
        phone_confirmed_at: u.phone_confirmed_at,
      })),
    );

    if (users.length < perPage) break;
    page += 1;
  }

  const tables: Record<string, Array<Record<string, unknown>>> = {};
  const { data: tableRows, error: tableErr } = await svc
    .schema("information_schema")
    .from("tables")
    .select("table_name")
    .eq("table_schema", "public")
    .eq("table_type", "BASE TABLE");

  if (tableErr) throw tableErr;

  for (const row of tableRows || []) {
    const table = row.table_name;
    if (!table) continue;

    const allRows: Array<Record<string, unknown>> = [];
    let from = 0;

    while (true) {
      const { data, error } = await svc
        .from(table)
        .select("*")
        .range(from, from + 999);

      if (error) throw error;
      if (!data || data.length === 0) break;

      allRows.push(...(data as Array<Record<string, unknown>>));
      if (data.length < 1000) break;
      from += 1000;
    }

    tables[table] = allRows;
  }

  const storage: BackupPayload["storage"] = {};
  for (const bucket of FACE_BUCKETS) {
    const paths = await listAllStoragePaths(svc, bucket);
    const files: BackupPayload["storage"][string] = [];

    for (const path of paths) {
      const { data, error } = await svc.storage.from(bucket).download(path);
      if (error || !data) continue;

      const bytes = new Uint8Array(await data.arrayBuffer());
      files.push({
        path,
        contentType: data.type || null,
        base64: toBase64(bytes),
      });
    }

    storage[bucket] = files;
  }

  const backup: BackupPayload = {
    version: "1.0.0",
    createdAt: new Date().toISOString(),
    authUsers,
    tables,
    storage,
  };

  return {
    backup,
    stats: {
      users: authUsers.length,
      tables: Object.keys(tables).length,
      storageFiles: Object.values(storage).reduce((sum, files) => sum + files.length, 0),
    },
  };
}

async function cleanCloud(svc: ReturnType<typeof createClient>, callerUserId: string, includeAuthUsers: boolean) {
  for (const bucket of FACE_BUCKETS) {
    const paths = await listAllStoragePaths(svc, bucket);
    for (let i = 0; i < paths.length; i += 100) {
      const chunk = paths.slice(i, i + 100);
      if (chunk.length > 0) {
        await svc.storage.from(bucket).remove(chunk);
      }
    }
  }

  for (const table of DELETE_ORDER) {
    let q = svc.from(table).delete().not("id", "is", null);
    if (table === "user_roles" || table === "profiles") {
      q = svc.from(table).delete().neq("user_id", callerUserId);
    }
    const { error } = await q;
    if (error) console.error(`delete ${table}:`, error.message);
  }

  if (includeAuthUsers) {
    let page = 1;
    const perPage = 500;
    while (true) {
      const { data, error } = await svc.auth.admin.listUsers({ page, perPage });
      if (error) throw error;
      const users = data?.users || [];

      for (const u of users) {
        if (u.id === callerUserId) continue;
        await svc.auth.admin.deleteUser(u.id);
      }

      if (users.length < perPage) break;
      page += 1;
    }
  }

  return { ok: true };
}

async function restoreBackup(svc: ReturnType<typeof createClient>, backup: BackupPayload) {
  if (!backup || !backup.tables || !backup.storage || !Array.isArray(backup.authUsers)) {
    throw new Error("Invalid backup file format");
  }

  for (const table of DELETE_ORDER) {
    const { error } = await svc.from(table).delete().not("id", "is", null);
    if (error) console.error(`restore-clean ${table}:`, error.message);
  }

  for (const table of RESTORE_ORDER) {
    const rows = backup.tables?.[table] || [];
    if (!Array.isArray(rows) || rows.length === 0) continue;
    const { error } = await svc.from(table).insert(rows);
    if (error) console.error(`insert ${table}:`, error.message);
  }

  for (const bucket of FACE_BUCKETS) {
    const paths = await listAllStoragePaths(svc, bucket);
    for (let i = 0; i < paths.length; i += 100) {
      const chunk = paths.slice(i, i + 100);
      if (chunk.length > 0) {
        await svc.storage.from(bucket).remove(chunk);
      }
    }
  }

  for (const [bucket, files] of Object.entries(backup.storage || {})) {
    if (!FACE_BUCKETS.includes(bucket)) continue;
    for (const file of files || []) {
      const bytes = fromBase64(file.base64);
      await svc.storage.from(bucket).upload(file.path, bytes, {
        upsert: true,
        contentType: file.contentType || "application/octet-stream",
      });
    }
  }

  for (const user of backup.authUsers) {
    const email = (user.email as string | undefined)?.trim();
    const id = user.id as string | undefined;
    if (!email || !id) continue;

    const { data: existing } = await svc.auth.admin.getUserById(id);
    if (existing?.user) continue;

    const tempPassword = crypto.randomUUID() + "Aa1!";
    await svc.auth.admin.createUser({
      id,
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: (user.user_metadata as Record<string, unknown>) || {},
      app_metadata: (user.app_metadata as Record<string, unknown>) || {},
      phone: (user.phone as string | undefined) || undefined,
    });
  }

  return {
    ok: true,
    restored: {
      users: backup.authUsers.length,
      tables: Object.keys(backup.tables).length,
      storageBuckets: Object.keys(backup.storage).length,
    },
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { svc, callerUserId } = await requireAdmin(req);
    const payload = await req.json().catch(() => ({}));
    const action = payload?.action;

    if (action === "export_backup") {
      const result = await exportBackup(svc);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "restore_backup") {
      const result = await restoreBackup(svc, payload?.backup as BackupPayload);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "clean_cloud") {
      if (payload?.confirmationCode !== "CLEAN MY CLOUD") {
        return new Response(JSON.stringify({ error: "Invalid confirmation code" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const result = await cleanCloud(svc, callerUserId, Boolean(payload?.includeAuthUsers));
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unsupported action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    const status = error instanceof Response ? error.status : 500;
    const message = error instanceof Response ? "Request failed" : error?.message || "Unexpected error";
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});