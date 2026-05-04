import { supabase } from '@/integrations/supabase/client';

type AttendanceCaptureMode = 'ai-scan' | 'qr-scan' | 'gate-mode' | string;

interface RegistrationTrainingUploadInput {
  imageBlob: Blob;
  studentId: string;
  employeeId?: string;
  category?: string;
  label?: string;
}

interface AttendanceTrainingUploadInput {
  imageBlob: Blob;
  studentId: string;
  status: 'present' | 'late' | 'absent' | 'unauthorized';
  mode?: AttendanceCaptureMode;
  confidence?: number;
  employeeId?: string;
  category?: string;
}

const sanitizeSegment = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown';

const parseClassSection = (category?: string) => {
  const raw = (category || '').trim();
  const [classPart, sectionPart] = raw.includes('-') ? raw.split('-', 2) : [raw, 'unknown'];

  return {
    className: sanitizeSegment(classPart || 'unknown'),
    sectionName: sanitizeSegment(sectionPart || 'unknown'),
  };
};

const getUploaderId = async () => {
  const { data } = await supabase.auth.getUser();
  return data.user?.id || null;
};

export const dataUrlToBlob = async (dataUrl: string): Promise<Blob | null> => {
  try {
    const base64Data = dataUrl.split(',')[1];
    if (!base64Data) return null;

    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }

    return new Blob([new Uint8Array(byteNumbers)], { type: 'image/jpeg' });
  } catch {
    return null;
  }
};

export const uploadRegistrationTrainingImage = async (
  input: RegistrationTrainingUploadInput,
): Promise<string | null> => {
  const uploaderId = await getUploaderId();
  if (!uploaderId) return null;

  const { className, sectionName } = parseClassSection(input.category);
  const studentKey = sanitizeSegment(input.employeeId || input.studentId);
  const label = sanitizeSegment(input.label || 'register');
  const timestamp = Date.now();

  const path = `${uploaderId}/class-${className}/section-${sectionName}/student-${studentKey}/${timestamp}-${label}.jpg`;

  const { error } = await supabase.storage
    .from('student-registration-faces')
    .upload(path, input.imageBlob, { contentType: 'image/jpeg', upsert: false, cacheControl: '3600' });

  if (error) {
    console.warn('Registration training upload failed:', error.message);
    return null;
  }

  return path;
};

export const uploadAttendanceTrainingImage = async (
  input: AttendanceTrainingUploadInput,
): Promise<string | null> => {
  const uploaderId = await getUploaderId();
  if (!uploaderId) return null;

  const dateKey = new Date().toISOString().split('T')[0];
  const mode = sanitizeSegment(input.mode || 'ai-scan');
  const studentKey = sanitizeSegment(input.employeeId || input.studentId);
  const status = sanitizeSegment(input.status);
  const confidenceLabel = Math.round(((input.confidence ?? 1) * 100));
  const path = `${uploaderId}/date-${dateKey}/mode-${mode}/student-${studentKey}/status-${status}/${Date.now()}-conf-${confidenceLabel}.jpg`;

  const { error } = await supabase.storage
    .from('attendance-training-faces')
    .upload(path, input.imageBlob, { contentType: 'image/jpeg', upsert: false, cacheControl: '3600' });

  if (error) {
    console.warn('Attendance training upload failed:', error.message);
    return null;
  }

  return path;
};
