# Bulk PR: Onboarding tools + scan UX + bug fixes

## What you'll get

### 1. CSV student onboarding (Admin )

- New "Upload CSV" button on the Admin  panel.
- Accepts columns: `roll_number, name, class, section, parent_name, parent_phone, parent_email`.
- Creates an auth user (random password, email auto-confirmed) per row, fills `profiles`, assigns `user` role.
- Skips rows with duplicate roll numbers, shows per-row success/error report.
- A "Sample CSV" download button so school staff have a template.
- Face capture is **not** done at upload — students appear in the directory and can be face-registered later from a "Capture Face" button next to each row.

### 2. Animated "Capture Face" flow on the Students table

- New camera icon on every student row → opens the existing AutoCapture10 (10-photo) flow pre-bound to that student's `user_id`.
- Adds a glassy modal with framer-motion ring, scan-line, and success burst (matches the iOS look already in the project).
- make it redirect to register page's face capture 

### 3. Scan confirmation screen (before saving attendance)

- After every successful match (Attendance, Mobile capture, Multi-face), a confirmation card appears for ~4s with:
  - Cropped face thumbnail (drawn from the live frame)
  - Matched student name + roll number
  - Confidence % (large, color-coded)
  - "Confirm" / "Not me — retake" buttons + auto-confirm countdown
- Only on Confirm does the attendance record + notification fire(all).
- Configurable in settings (default ON, can be disabled for kiosk-style speed).

### 4. WhatsApp "Notify now" button

- New button on `RecognizedFaceAlert` and the Admin notification log row → calls the existing `send-whatsapp` edge function with that student's `parent_phone`.
- Loading + toast feedback, disables for 10s after click to prevent spam.
- The auto-flow stays one-message-per-day; this button is a manual override for retries.  

- with email send  automatically  send  sms after attendance  mark

### 5. Gate-mode detection box

- Admin draggable/resizable rectangle overlay in `GateModeScanner` (saved per-gate to `school_gates.detection_box` as JSON).
- Only faces whose bounding box center is inside the rectangle trigger recognition — anything else is ignored. Box drawn as a glowing cyan border with "Detection Zone" label.
- Removes any zoom transition: I'll audit `GateModeScanner` + `GateEntryFeedback` for `scale()` / framer-motion `scale` on detection and lock to `scale: 1`.

### 6. Bug fixes

**A. "Parent emails go to [gauravraj10226@gmail.com](mailto:gauravraj10226@gmail.com)"**
The only hardcoded reference is the Contact page (intentional). Real cause: when you registered, your profile's `parent_email` was set to that address. I'll:

- Audit the Register page and CSV importer to never default `parent_email` to a global value.
- Make `auto-parent-notification` log the actual `parent_email` used in `notification_log.recipient_phone` so you can verify per-send in the Admin → Notification Log.
- If you want, I'll also clear stale `parent_email` rows now via a one-shot data fix.

**B. QR scanner / AI scanner / Gate mode ignore cutoff**
`GateMode` already reads `attendance_settings.cutoff_time` but `QRCodeScanner.tsx` and the AI scanner path in `Attendance.tsx` use a separate or stale value. Fix: centralize via `getAttendanceCutoffTime()` from `AttendanceSettingsService` and apply the same `late` logic everywhere (status = `late` if `now >= cutoff`).

**C. Gate mode auto-zoom on recognition**
Will remove the `scale` animation on `GateEntryFeedback` and any CSS transform on the video element after match.

## Where photos are stored (your question)

Every face capture is uploaded to **Lovable Cloud Storage**, public bucket `face-images`. Each row in `attendance_records.image_url` is the public URL pointing to that file (e.g. `https://<project>.supabase.co/storage/v1/object/public/face-images/<userId>/<timestamp>.jpg`). The same URL is what's embedded in parent emails as the "photo proof". Face descriptors (the math vector used for matching, not the photo) live in `face_descriptors.descriptor` as JSONB.

## Files I'll touch

- New: `src/components/admin/StudentCSVImporter.tsx`, `src/components/admin/CaptureFaceDialog.tsx`, `src/components/attendance/ScanConfirmation.tsx`, `src/components/gate/DetectionBoxEditor.tsx`, `supabase/functions/bulk-create-students/index.ts`
- Edited: `src/components/admin/StudentDetailsTable.tsx` (CSV button + capture column), `src/components/attendance/RecognizedFaceAlert.tsx` (WhatsApp button), `src/components/gate/GateModeScanner.tsx` (box gate + no zoom), `src/components/attendance/QRCodeScanner.tsx` + `src/pages/Attendance.tsx` (cutoff), `supabase/functions/auto-parent-notification/index.ts` (log recipient), and a migration to add `school_gates.detection_box` JSONB.

## Notes

- I'll keep all UI in the existing iOS-glass + framer-motion style (already in core memory).
- WhatsApp delivery itself depends on Meta approving your phone-number/template; I can't fix delivery from code if Meta rejects messages. After the notify button is wired I'll show you exactly how to read `notification_log.gateway_response` for Meta errors.
- This is one large PR (your choice). I'll ship in this order: bugs (A–C) → WhatsApp button → scan confirmation → CSV import → detection box.