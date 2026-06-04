## Goal
Make the platform significantly faster, smoother, and more practical for daily school use by shipping 20 focused improvements across frontend performance, realtime data flow, attendance recognition, and backend reliability.

## Delivery plan (20 changes)

### Phase 1 — Fast wins (UI speed + smoothness)
1. **Lazy-load heavy routes** (`/attendance`, `/teacher`, `/gate`, `/admin`, `/features`) with route-level code splitting.
2. **Enable React Query cache defaults** (staleTime/cacheTime/retry tuning) to reduce repeated requests while navigating.
3. **Limit expensive page animations on low-end/mobile** by honoring reduced-motion and lowering blur/transform intensity.
4. **Debounce high-frequency scanner UI state updates** in attendance components to avoid frame drops.
5. **Replace duplicate realtime listeners** where both session and legacy attendance subscriptions run at once.
6. **Virtualize long attendance lists/feed panels** so only visible rows render.
7. **Add strict memoization** for reusable dashboard cards and scanner overlays that re-render too often.
8. **Preload critical model/assets only when entering scan routes**, not globally at app boot.

### Phase 2 — Attendance pipeline performance
9. **Short-circuit recognition fallback path** so legacy full-table comparisons run only when trained descriptor path truly fails.
10. **Batch profile/avatar lookups** during recognition to remove per-match query chains.
11. **Reduce repeated cutoff-time reads** by caching attendance settings for a short TTL client-side.
12. **Throttle continuous scanner loop adaptively** (dynamic frame interval based on device performance/processing time).
13. **Stop duplicate attendance writes** by adding stronger client idempotency keys per scan session.
14. **Trim payload size for realtime events** (store only practical metadata required for teacher views/notifications).

### Phase 3 — Realtime classroom practicality
15. **Scope realtime channels by class+section+day** to prevent unrelated updates and reduce network chatter.
16. **Use active-session lifecycle controls** (start/end session explicitly) so teacher views load only current session data.
17. **Add optimistic local counters** (present/late/absent) with server reconciliation for instant UI response.
18. **Fallback polling only when realtime disconnects** with exponential backoff (avoid aggressive refetch loops).

### Phase 4 — Backend/query hardening
19. **Add targeted indexes for session/event hot paths** (class_sessions lookup, attendance_session_events session/time/status patterns).
20. **Add observability baseline** (latency, recognition success, duplicate block rate, realtime subscription health) and surface in admin diagnostics.

## Implementation order
1. Phase 1 (weeks 1–2): immediate UX speed improvements with minimal risk.
2. Phase 2 (weeks 2–3): optimize face recognition + write path.
3. Phase 3 (weeks 3–4): realtime correctness and classroom ergonomics.
4. Phase 4 (week 4): backend index/metrics hardening and go-live validation.

## Acceptance criteria
- Attendance page interactive under **2s** on mobile network.
- Scanner loop remains visually smooth (no major frame stutter) during continuous mode.
- Class attendance updates appear in teacher view within **<3s** end-to-end.
- Duplicate attendance records effectively blocked for same student/session.
- Realtime disconnect recovery works without manual refresh.

## Technical details
- **Frontend focus areas:** `App.tsx`, route loading strategy, `PageLayout`, `Attendance.tsx`, scanner/feed components, realtime hooks.
- **Recognition focus areas:** optimized vs legacy matching path, metadata/profile query reduction, settings cache, adaptive loop timing.
- **Realtime focus areas:** channel scoping, subscription lifecycle cleanup, practical payload design, offline/reconnect behavior.
- **Backend focus areas:** attendance session/event query patterns, index coverage, event write idempotency, performance telemetry.
- **Risk control:** ship each phase behind safe toggles where possible and validate with a pilot class before wider rollout.
## Goal
Make the current school platform reliable for **real-time class operations** (attendance, gate flow, teacher visibility, parent notifications, and admin control) with production-grade stability.

## What already exists (baseline)
- Face/QR attendance flows, gate mode, role-based routes, mobile-friendly UI, and notification listeners are already in place.
- Backend functions and email queue pipeline already exist, so this is an optimization + hardening rollout, not a greenfield build.

## Phase 1 — Real-time classroom core (MVP)
1. **Define class-session model**
   - Standardize real-time entities: school → class → section → period/session → attendance event.
   - Add strict event states (detected, verified, corrected, late, absent).
2. **Live attendance pipeline hardening**
   - Ensure each scan is idempotent (no duplicate student marks in same session).
   - Add server-side conflict rules for near-simultaneous scans.
3. **Teacher real-time class view**
   - One screen showing: present/late/absent counts, recent entries, unresolved mismatches.
   - Fast correction actions (mark present/late/excused) with audit trail.
4. **Gate-to-class sync**
   - When a student is captured in gate mode, reflect in active class attendance within seconds.

## Phase 2 — Reliability, accuracy, and trust
1. **Recognition quality controls**
   - Confidence thresholds by environment (classroom/gate).
   - Multi-face and poor-light fallback to QR/manual verification.
2. **Data quality guardrails**
   - Duplicate prevention at DB level + correction queue for uncertain detections.
   - Reconciliation job for missed or delayed events.
3. **Operational dashboards**
   - Live health metrics: scan latency, match success rate, duplicate block count, queue failures.
   - School-level and class-level drill-down.

## Phase 3 — Communication automation
1. **Event-driven notifications**
   - Parent alerts for absent/late thresholds and end-of-day summary.
   - Teacher/admin alerts for device offline, abnormal scan drops, mismatch spikes.
2. **Email resilience policy**
   - Primary provider + fallback provider routing with retry and suppression handling.
   - Delivery logging visible to admins.
3. **Policy engine**
   - School-configurable rules: grace periods, late cutoff, holiday overrides, notification timing.

## Phase 4 — Scale and production readiness
1. **Performance engineering**
   - Real-time subscriptions tuned by class scope.
   - Query/index optimization for peak school timings.
2. **Security & governance**
   - Tight RLS checks for class-scoped access.
   - Full audit logs for edits and overrides.
3. **Disaster readiness**
   - Backup/restore drills, queue replay strategy, and incident runbook.

## QA & rollout strategy
1. **Pilot first (1–2 classes)**
   - Run in shadow mode with manual register comparison for 1 week.
2. **Acceptance criteria**
   - Attendance update latency: target <3s in classroom UI.
   - Duplicate mismatch rate: near-zero after conflict rules.
   - Notification delivery success: >99% within SLA window.
3. **Progressive rollout**
   - Expand by grade/section after pilot KPIs pass.

## Deliverables by milestone
- **M1:** Real-time class session model + deduplicated attendance events.
- **M2:** Teacher live view + correction workflow + gate sync.
- **M3:** Parent/admin notification automation with provider fallback.
- **M4:** Scale hardening, monitoring, security audit, school-wide rollout.

## Technical implementation notes
- Keep frontend on current route structure and role-protected pages.
- Prioritize backend event consistency and real-time channel design before adding more UI features.
- Treat “real-time correctness” (no duplicates, clear correction path) as higher priority than visual polish.