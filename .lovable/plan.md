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