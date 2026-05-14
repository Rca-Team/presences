
# Plan — Production-ready school deployment

This is a focused, atomic rollout. Everything ships behind a `pilotMode` class filter so you can roll out to one class first.

## 1. Roles & route guards

- `user_roles` already exists with `app_role` enum. Add `'teacher'` and `'parent'` to the enum if missing (admin already there).
- New hook `useUserRole()` already exists — extend with `isTeacher`, `isParent`, plus assigned `class`/`section` lookup from `class_teachers`.
- Add `<RoleRoute roles={['teacher','admin']}>` wrapper used by new teacher pages.
- Admin → Users tab gets a "Promote to Teacher" action that writes `user_roles` + `class_teachers` row.

## 2. Teacher portal (3 pages)

```text
/teacher              → Dashboard: today's attendance for assigned class, quick actions
/teacher/attendance   → AttendanceCapture pre-scoped to teacher's class/section
/teacher/gate         → Gate-mode scanner (re-uses GateModeScanner)
/teacher/timetable    → Read-only timetable + substitutions for their class (from period_timings + substitutions)
```

All 4 routes guarded by `RoleRoute={['teacher','admin']}`. Class/section is locked from the teacher's `class_teachers` record — they cannot pick another class.

## 3. Real-time notifications (cron + on-attendance)

### On-attendance trigger (instant)
Existing `auto-attendance-notifications` edge function is already wired to fire on insert. Patch it to:
- Read cutoff from `attendance_settings.key='cutoff_time'`
- Mark `present` if before cutoff, `late` if after
- Send Email (already works) + In-app notification (insert into `notifications`) + SMS (if Twilio configured in settings)

### Cron — daily absence sweep
Create TanStack server route `src/routes/api/public/hooks/absence-sweep.ts` that:
- Runs every 5 min after cutoff
- Finds students in pilot class with no attendance today
- Marks absent → fires same notification fan-out

Schedule via `pg_cron` calling that route.

### Notification fan-out helper (one place)
New edge function `notify-parent` invoked by both the trigger and the cron, accepts `{userId, status, channels}`, dispatches to the channels enabled in `attendance_settings`.

## 4. Admin Settings panel (new tab "Notifications & Cutoff")

Stored in `attendance_settings` (key/value rows):
- `cutoff_time` — time picker (default 09:15)
- `pilot_classes` — multi-select of classes to enable (e.g. `["6-A"]`)
- `notify_channels` — checkboxes Email / In-app / SMS
- `twilio_account_sid`, `twilio_auth_token`, `twilio_from_number` — text inputs (token stored in Supabase as plain settings row — admin-only RLS already protects it; flagged with a "store in secrets for production" notice)
- `notification_templates` — editable text for present / late / absent

Settings cached client-side; edge functions read fresh per call.

## 5. ID card logo fix

`src/assets/kv-logo.png` is already replaced. Issue: `html2canvas` crops the round image because the parent `<img>` inside the dark header has a white circle background but the imported file has a checkerboard transparent border. Fix in `StudentIDCardGenerator.tsx`:
- Embed logo as base64 once (via `new Image() → canvas → toDataURL`) and inline into the HTML string so html2canvas never has to fetch it.
- Set `width:56;height:56;object-fit:contain;background:#fff;border-radius:50%;padding:4px`.
- Same fix in the live preview block.

## 6. Practical "better than manual" extras (low-cost, high-value)

- **One-tap "Mark whole class absent except scanned"** button after gate-mode session ends — slashes admin work.
- **Daily attendance digest email** to class teacher at end of day (uses existing email infra, new template).
- **Parent reply tracking** — when a parent replies to absent email with a reason, store it in `late_entries.reason` via the existing inbound `receive-email` function.
- **QR-code attendance fallback** — student ID-card QR can be scanned in `AttendanceCapture` when face recognition fails (camera lighting, mask, etc.).
- **Sick / leave pre-application** in Parent Portal — creates an `attendance_records` row with `status='excused'` so the cron does not mark absent.

## 7. Files touched

```text
NEW   src/routes/api/public/hooks/absence-sweep.ts
NEW   src/pages/TeacherDashboard.tsx
NEW   src/pages/TeacherAttendance.tsx
NEW   src/pages/TeacherGate.tsx
NEW   src/pages/TeacherTimetable.tsx
NEW   src/components/RoleRoute.tsx
NEW   src/components/admin/NotificationSettings.tsx
NEW   supabase/functions/notify-parent/index.ts
EDIT  supabase/functions/auto-attendance-notifications/index.ts
EDIT  supabase/functions/absence-cutoff-notify/index.ts (delegate to notify-parent)
EDIT  src/components/admin/StudentIDCardGenerator.tsx  (logo fix)
EDIT  src/components/features/StudentIDCard.tsx       (logo fix)
EDIT  src/hooks/useUserRole.ts
EDIT  src/App.tsx                                     (new routes)
EDIT  src/pages/Admin.tsx                             (new settings tab)
SQL   migration: add 'teacher','parent' to app_role; ensure attendance_settings rows; pg_cron schedule
```

## 8. Rollout order (so you see results fast)

1. ID-card logo fix (visible in 30 sec)
2. Migration + admin Notification Settings UI
3. Teacher role + 4 teacher pages
4. Patch on-attendance edge function (instant present/late)
5. New `notify-parent` fan-out + absence-sweep cron
6. Practical extras (digest, QR fallback, leave pre-application)

## Notes

- Twilio key is **not** requested now — captured in admin settings as you asked. For real production we should still move it to Supabase secrets; a banner in the settings panel makes that recommendation.
- All pilot-mode logic gates on `pilot_classes` setting — the class 6-A you start with is the only one notifications fire for, so other classes can run silently until you scale up.
- Existing edge functions already deployed — no new secrets required for email/in-app.

Reply **approve** to start; I'll execute step 1 (logo) immediately and the rest in order.
