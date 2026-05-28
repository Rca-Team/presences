import { supabase } from '@/integrations/supabase/client';

const FACE_BUCKET = 'face-images';
const signedUrlCache = new Map<string, string>();

const unwrapPath = (value: string) => value.replace(/^\/+/, '').trim();

const extractFaceBucketPath = (raw: string): string | null => {
  const value = raw.trim();
  if (!value || value.startsWith('data:')) return null;

  if (/^https?:\/\//i.test(value)) {
    if (value.includes('/storage/v1/object/sign/face-images/')) return null;

    const marker = '/face-images/';
    const markerIndex = value.indexOf(marker);
    if (markerIndex >= 0) {
      const pathWithQuery = value.slice(markerIndex + marker.length);
      const [path] = pathWithQuery.split('?');
      return unwrapPath(path);
    }

    return null;
  }

  return unwrapPath(value.replace(/^face-images\//, ''));
};

export const pickPreferredPhotoCandidate = (
  ...candidates: Array<string | null | undefined>
): string => {
  for (const candidate of candidates) {
    const value = candidate?.toString().trim();
    if (value) return value;
  }
  return '';
};

export const resolveStudentPhotoUrl = async (raw?: string | null): Promise<string> => {
  const value = raw?.toString().trim();
  if (!value) return '';
  if (value.startsWith('data:')) return value;

  const bucketPath = extractFaceBucketPath(value);
  if (!bucketPath) return value;

  if (signedUrlCache.has(bucketPath)) return signedUrlCache.get(bucketPath)!;

  const { data, error } = await supabase.storage
    .from(FACE_BUCKET)
    .createSignedUrl(bucketPath, 60 * 60 * 24 * 7);

  if (!error && data?.signedUrl) {
    signedUrlCache.set(bucketPath, data.signedUrl);
    return data.signedUrl;
  }

  const publicUrl = supabase.storage.from(FACE_BUCKET).getPublicUrl(bucketPath).data.publicUrl;
  return publicUrl || value;
};
