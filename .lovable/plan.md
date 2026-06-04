## Goal

Make the platform faster, smoother, and more practical for daily school operations using 20 focused upgrades.

## To-do plan (20 improvements)

### A) Frontend speed and smooth UX

1. Split large routes with lazy loading (`attendance`, `teacher`, `gate`, `admin`, `features`).
2. Add route-level skeleton loaders for better perceived speed.
3. Configure React Query defaults (stale time, cache time, retry) to reduce extra refetches.
4. Reduce heavy blur/transform animation on mobile only if   low-power devices.
5. Honor reduced-motion and provide lightweight animation fallback.
6. Memoize expensive dashboard/attendance components to cut re-renders.
7. Virtualize long attendance feeds/lists to render only visible rows.
8. Defer non-critical listeners/components until after initial page paint.

### B) Attendance scanner performance

9. Throttle continuous scan loop dynamically by device speed.
10. Debounce scanner state updates and notification bursts.
11. Cache attendance cutoff time/settings with short TTL.
12. Short-circuit recognition fallback so full legacy matching runs only when needed.
13. Batch profile/avatar fetches instead of per-candidate chained queries.
14. Add stronger client idempotency key generation per scan session.

### C) Realtime reliability and practicality

15. Scope realtime channels by class + section + school_day to reduce noisy events.
16. Remove duplicate subscriptions (legacy + session listeners firing together).
17. Add realtime connection health indicator and auto-reconnect backoff.
18. Add fallback polling only during disconnect state, then auto-stop when reconnected.

### D) Backend/query hardening

19. Add targeted indexes for hot reads on `class_sessions` and `attendance_session_events`.
20. Add performance telemetry dashboard (scan latency, recognition success, duplicate-block count, subscription health).

## Rollout sequence

1. **Sprint 1:** Items 1–8 (fast UI wins).
2. **Sprint 2:** Items 9–14 (scanner and recognition optimization).
3. **Sprint 3:** Items 15–18 (realtime resilience).
4. **Sprint 4:** Items 19–20 (database hardening + observability).

## Success metrics

- Attendance page interactive in under ~2s on mobile.
- Smooth scanner experience with minimal stutter in continuous mode.
- Class attendance reflects in teacher view within ~3s.
- Duplicate marks for same student/session are effectively blocked.
- Realtime reconnect works automatically without manual refresh.

## Technical notes

- Frontend scope: `App.tsx`, attendance pages/components, layout, realtime hooks.
- Scanner scope: optimized recognition flow, cached settings, adaptive loop control.
- Backend scope: session/event indexes, event payload trimming, telemetry instrumentation.