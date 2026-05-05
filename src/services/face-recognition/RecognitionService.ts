import { supabase } from '@/integrations/supabase/client';
import { descriptorToString, stringToDescriptor } from './ModelService';
import { getAttendanceCutoffTime } from '../attendance/AttendanceSettingsService';
import { getAllTrainedDescriptors } from './ProgressiveTrainingService';
import { dataUrlToBlob, uploadAttendanceTrainingImage } from './TrainingDataStorageService';

interface Employee {
  id: string;
  name: string;
  employee_id: string;
  department: string;
  position: string;
  firebase_image_url: string;
  avatar_url?: string;
  trainingSamples?: number;
}

interface RecognitionResult {
  recognized: boolean;
  employee?: Employee;
  confidence?: number;
}

interface DeviceInfo {
  metadata?: {
    name?: string;
    employee_id?: string;
    department?: string;
    position?: string;
    firebase_image_url?: string;
    faceDescriptor?: string;
  };
  type?: string;
  timestamp?: string;
  registration?: boolean;
  firebase_image_url?: string;
}

const sanitizeSegment = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown';

/**
 * Parse a descriptor from various storage formats (string, array, object)
 */
function parseDescriptor(raw: any): Float32Array | null {
  try {
    if (!raw) return null;
    if (raw instanceof Float32Array) return raw;
    if (typeof raw === 'string') {
      return stringToDescriptor(raw);
    }
    if (Array.isArray(raw)) {
      const arr = new Float32Array(raw as number[]);
      return arr.length === 128 ? arr : null;
    }
    if (typeof raw === 'object') {
      // jsonb object with numeric keys {"0": 0.1, "1": 0.2, ...}
      const keys = Object.keys(raw);
      if (keys.length === 128) {
        const values = new Float32Array(128);
        for (let i = 0; i < 128; i++) {
          values[i] = Number(raw[i] ?? raw[String(i)] ?? 0);
        }
        return values;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Cosine similarity between two descriptors.
 * Returns value between 0 (identical) and 2 (opposite).
 * face-api.js descriptors work best with Euclidean distance on raw (unnormalized) vectors.
 */
function euclideanDistance(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

/**
 * Cosine distance as supplementary metric
 */
function cosineDistance(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return Infinity;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  if (denom === 0) return Infinity;
  const similarity = dot / denom;
  return Math.sqrt(Math.max(0, 2 * (1 - similarity)));
}

/**
 * Combined distance metric: uses the minimum of Euclidean and cosine distance
 * to be more forgiving of lighting/angle variations.
 */
function combinedDistance(a: Float32Array, b: Float32Array): number {
  return Math.min(euclideanDistance(a, b), cosineDistance(a, b));
}

export async function recognizeFace(faceDescriptor: Float32Array): Promise<RecognitionResult> {
  try {
    console.log('Starting face recognition (improved pipeline)');
    
    // DO NOT normalize the input — face-api.js descriptors are meant to be
    // compared raw via Euclidean distance. Normalizing destroys magnitude info.
    const inputDescriptor = faceDescriptor;
    
    // ── Phase 1: Match against progressively trained descriptors (face_descriptors table) ──
    const trainedDescriptors = await getAllTrainedDescriptors();
    
    let bestMatch: { userId: string; userName: string; distance: number; sampleCount: number } | null = null;
    // face-api.js typical same-person distance: 0.3–0.45
    // Use stricter threshold for school gate accuracy (balanced high-accuracy mode)
    const MATCH_THRESHOLD = 0.5;
    let bestDistance = MATCH_THRESHOLD;
    
    for (const [userId, data] of trainedDescriptors) {
      // Compare against every stored sample and averaged descriptor
      let minDist = euclideanDistance(inputDescriptor, data.averagedDescriptor);
      
      for (const descriptor of data.descriptors) {
        const dist = euclideanDistance(inputDescriptor, descriptor);
        if (dist < minDist) minDist = dist;
      }
      
      // Also try cosine distance
      const cosDist = cosineDistance(inputDescriptor, data.averagedDescriptor);
      minDist = Math.min(minDist, cosDist);
      
      console.log(`Match: ${data.userName} (${data.sampleCount} samples) - distance: ${minDist.toFixed(4)}`);
      
      if (minDist < bestDistance) {
        bestDistance = minDist;
        bestMatch = {
          userId,
          userName: data.userName,
          distance: minDist,
          sampleCount: data.sampleCount
        };
      }
    }
    
    // If found a match in trained descriptors, fetch full user info
    if (bestMatch) {
      console.log(`Best match: ${bestMatch.userName} (distance: ${bestMatch.distance.toFixed(4)}, samples: ${bestMatch.sampleCount})`);
      
      const { data: registrationData } = await supabase
        .from('attendance_records')
        .select('id, user_id, device_info')
        .eq('user_id', bestMatch.userId)
        .in('status', ['registered', 'pending_approval'])
        .limit(1)
        .single();
        
      if (registrationData) {
        const deviceInfo = registrationData.device_info as DeviceInfo | null;
        const employeeData = deviceInfo?.metadata;
        
        let avatarUrl = employeeData?.firebase_image_url || '';
        const { data: profileData } = await supabase
          .from('profiles')
          .select('avatar_url')
          .eq('user_id', bestMatch.userId)
          .maybeSingle();
        
        if (profileData?.avatar_url) {
          avatarUrl = profileData.avatar_url;
        }
        
        return {
          recognized: true,
          employee: {
            id: bestMatch.userId,
            name: employeeData?.name || bestMatch.userName,
            employee_id: employeeData?.employee_id || 'Unknown',
            department: employeeData?.department || 'Unknown',
            position: employeeData?.position || 'Unknown',
            firebase_image_url: employeeData?.firebase_image_url || '',
            avatar_url: avatarUrl,
            trainingSamples: bestMatch.sampleCount
          },
          confidence: Math.max(0, 1 - bestMatch.distance)
        };
      }
    }
    
    // ── Phase 2: Fallback to legacy recognition from attendance_records ──
    console.log('Falling back to legacy recognition from attendance_records');
    
    const { data, error } = await supabase
      .from('attendance_records')
      .select('id, user_id, status, device_info, face_descriptor')
      .in('status', ['registered', 'pending_approval']);
    
    if (error) {
      console.error('Error querying attendance records:', error);
      throw new Error(`Database query failed: ${error.message}`);
    }
    
    if (!data || data.length === 0) {
      console.log('No registered faces found in the database');
      return { recognized: false };
    }
    
    console.log(`Found ${data.length} registered faces for legacy comparison`);
    
    let legacyBestMatch: any = null;
    let legacyBestDistance = MATCH_THRESHOLD;
    
    for (const record of data) {
      try {
        // Try face_descriptor column first
        const columnDescriptor = parseDescriptor(record.face_descriptor);
        if (columnDescriptor) {
          const distance = euclideanDistance(inputDescriptor, columnDescriptor);
          console.log(`Legacy (column): distance = ${distance.toFixed(4)} for record ${record.id}`);
          if (distance < legacyBestDistance) {
            legacyBestDistance = distance;
            legacyBestMatch = record;
          }
        }
        
        // Fallback to device_info.metadata.faceDescriptor
        const deviceInfo = record.device_info as DeviceInfo | null;
        const metaDescriptorRaw = deviceInfo?.metadata?.faceDescriptor;
        if (metaDescriptorRaw) {
          const metaDescriptor = parseDescriptor(metaDescriptorRaw);
          if (metaDescriptor) {
            const distance = euclideanDistance(inputDescriptor, metaDescriptor);
            const personName = deviceInfo?.metadata?.name || 'unknown';
            console.log(`Legacy (metadata): distance = ${distance.toFixed(4)} for ${personName}`);
            if (distance < legacyBestDistance) {
              legacyBestDistance = distance;
              legacyBestMatch = record;
            }
          }
        }
      } catch (e) {
        console.error('Error processing record:', e);
      }
    }
    
    if (legacyBestMatch) {
      console.log(`Best legacy match found with distance: ${legacyBestDistance.toFixed(4)} (confidence: ${((1 - legacyBestDistance) * 100).toFixed(1)}%)`);
      
      const deviceInfo = legacyBestMatch.device_info as DeviceInfo | null;
      const employeeData = deviceInfo?.metadata;
      
      if (!employeeData) {
        console.error('Employee metadata missing from best match');
        return { recognized: false };
      }

      let avatarUrl = employeeData.firebase_image_url || '';
      if (legacyBestMatch.user_id && legacyBestMatch.user_id !== 'unknown') {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('avatar_url')
          .eq('user_id', legacyBestMatch.user_id)
          .maybeSingle();
        
        if (profileData?.avatar_url) {
          avatarUrl = profileData.avatar_url;
        }
      }
      
      return {
        recognized: true,
        employee: {
          id: legacyBestMatch.user_id || 'unknown',
          name: employeeData.name || 'Unknown',
          employee_id: employeeData.employee_id || 'Unknown',
          department: employeeData.department || 'Unknown',
          position: employeeData.position || 'Unknown',
          firebase_image_url: employeeData.firebase_image_url || '',
          avatar_url: avatarUrl,
        },
        confidence: Math.max(0, 1 - legacyBestDistance)
      };
    }
    
    console.log('No face match found above confidence threshold');
    return { recognized: false };
  } catch (error) {
    console.error('Face recognition error:', error);
    throw error;
  }
}

// Check if current time is past cutoff time
async function isPastCutoffTime(): Promise<boolean> {
  try {
    const cutoffTime = await getAttendanceCutoffTime();
    const now = new Date();
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffTime.hour, cutoffTime.minute, 0, 0);
    return now > cutoffDate;
  } catch (error) {
    console.error('Error checking cutoff time, defaulting to 9:00 AM:', error);
    const now = new Date();
    const cutoffDate = new Date();
    cutoffDate.setHours(9, 0, 0, 0);
    return now > cutoffDate;
  }
}

export async function recordAttendance(
  userId: string,
  status: 'present' | 'late' | 'absent' | 'unauthorized',
  confidence?: number,
  deviceInfo?: any,
  capturedImageDataUrl?: string,
  captureMode: 'ai-scan' | 'qr-scan' | 'gate-mode' = 'ai-scan'
): Promise<any> {
  try {
    console.log(`Recording attendance for user ${userId} with status ${status}`);

    // ── CONFIDENCE GATE ──
    // Only mark attendance when face match confidence is above 50%.
    // 'unauthorized' (unknown face) and explicit absence records bypass this gate.
    const MIN_ATTENDANCE_CONFIDENCE = 0.65;
    if (
      status !== 'unauthorized' &&
      status !== 'absent' &&
      typeof confidence === 'number' &&
      confidence < MIN_ATTENDANCE_CONFIDENCE
    ) {
      console.warn(
        `[Attendance] Skipping mark — confidence ${(confidence * 100).toFixed(1)}% below 50% threshold for user ${userId}`,
      );
      return { skipped: true, reason: 'low_confidence', confidence };
    }

    let timeAdjustedStatus = status;
    if (status === 'present') {
      const pastCutoff = await isPastCutoffTime();
      if (pastCutoff) {
        timeAdjustedStatus = 'late';
        console.log('Adjusting status to late based on cutoff time');
      }
    }
    
    let normalizedStatus = timeAdjustedStatus;
    if (status === 'unauthorized') {
      normalizedStatus = 'present';
    }
    
    const timestamp = new Date().toISOString();
    
    let userName = null;
    if (userId && userId !== 'unknown') {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', userId)
        .single();
        
      if (profileData?.username) {
        userName = profileData.username;
      }
    }
    
    // Upload captured image to storage if provided
    let uploadedImageUrl: string | null = null;
    let trainingAttendancePath: string | null = null;
    if (capturedImageDataUrl) {
      try {
        const blob = await dataUrlToBlob(capturedImageDataUrl);
        if (blob) {
          const fileName = `attendance/${userId}/${Date.now()}.jpg`;
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('face-images')
            .upload(fileName, blob, { contentType: 'image/jpeg', upsert: false });
          
          if (!uploadError && uploadData) {
            const { data: urlData } = supabase.storage
              .from('face-images')
              .getPublicUrl(fileName);
            uploadedImageUrl = urlData?.publicUrl || null;
            console.log('Captured image uploaded:', uploadedImageUrl);
          } else {
            console.warn('Failed to upload captured image:', uploadError);
          }

          // Keep an organized localized training copy in the dedicated attendance bucket
          trainingAttendancePath = await uploadAttendanceTrainingImage({
            imageBlob: blob,
            studentId: userId,
            status: normalizedStatus as 'present' | 'late' | 'absent' | 'unauthorized',
            mode: captureMode,
            confidence,
            employeeId: deviceInfo?.metadata?.employee_id,
            category: deviceInfo?.metadata?.category,
          });
        }
      } catch (uploadErr) {
        console.warn('Image upload error:', uploadErr);
      }
    }
    
    const fullDeviceInfo = {
      type: 'webcam',
      timestamp,
      confidence,
      ...deviceInfo,
      metadata: {
        ...deviceInfo?.metadata,
        name: userName || deviceInfo?.metadata?.name || 'Unknown',
        capture_mode: sanitizeSegment(captureMode),
        training_attendance_path: trainingAttendancePath,
      }
    };
    
    const { data, error } = await supabase
      .from('attendance_records')
      .insert({
        user_id: userId,
        timestamp,
        status: normalizedStatus,
        device_info: fullDeviceInfo,
        confidence_score: confidence,
        image_url: uploadedImageUrl
      })
      .select()
      .single();
    
    if (error) {
      console.error('Error recording attendance:', error);
      throw new Error(`Failed to record attendance: ${error.message}`);
    }
    
    console.log('Attendance recorded successfully:', data);
    
    // Auto-send parent notification with captured photo proof (non-blocking)
    import('@/services/notification/AutoNotificationService').then(({ sendAutoParentNotification }) => {
      const studentName = fullDeviceInfo?.metadata?.name || 'Student';
      const photoUrl = uploadedImageUrl || deviceInfo?.metadata?.firebase_image_url;
      sendAutoParentNotification(userId, studentName, normalizedStatus as 'present' | 'late' | 'absent', photoUrl)
        .then(res => console.log('Auto notification result:', res))
        .catch(err => console.error('Auto notification error:', err));
    }).catch(err => console.error('Failed to load notification service:', err));
    
    return data;
  } catch (error) {
    console.error('Error in recordAttendance:', error);
    throw error;
  }
}
