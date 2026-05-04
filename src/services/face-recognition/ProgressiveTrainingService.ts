import { supabase } from '@/integrations/supabase/client';
import { descriptorToString, stringToDescriptor } from './ModelService';
import { uploadImage } from './StorageService';
import { uploadAttendanceTrainingImage } from './TrainingDataStorageService';

// Increased to 30 to support continuous learning from daily attendance.
// More samples per user → better accuracy across lighting / angles / age changes.
const MAX_SAMPLES_PER_USER = 30;
// Raised threshold so we never contaminate a student's model with a mis-recognized face.
// Confidence here is the recognition confidence (1 - normalized distance).
const MIN_CONFIDENCE_FOR_TRAINING = 0.85;

interface TrainingSample {
  id: string;
  user_id: string;
  descriptor: string;
  image_url: string | null;
  created_at: string;
  label: string | null;
}

/**
 * Store a new face sample for progressive training
 * Called when attendance is successfully marked with high confidence
 */
export async function storeFaceSample(
  userId: string,
  faceDescriptor: Float32Array,
  imageBlob: Blob | null,
  userName: string,
  confidence: number
): Promise<boolean> {
  try {
    // Only store samples with high confidence (skip check if confidence is 1.0 = registration)
    if (confidence < MIN_CONFIDENCE_FOR_TRAINING && confidence !== 1.0) {
      console.log(`Skipping training sample - confidence ${confidence} below threshold ${MIN_CONFIDENCE_FOR_TRAINING}`);
      return false;
    }

    console.log(`Storing progressive training sample for user ${userId} with confidence ${confidence}`);

    // Check how many samples we already have for this user
    const { count, error: countError } = await supabase
      .from('face_descriptors')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (countError) {
      console.error('Error counting existing samples:', countError);
      return false;
    }

    const existingCount = count || 0;
    console.log(`User ${userId} has ${existingCount} existing face samples`);

    // If we have max samples, remove the oldest one
    if (existingCount >= MAX_SAMPLES_PER_USER) {
      const { data: oldestSample, error: fetchError } = await supabase
        .from('face_descriptors')
        .select('id')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (fetchError) {
        console.error('Error fetching oldest sample:', fetchError);
      } else if (oldestSample) {
        const { error: deleteError } = await supabase
          .from('face_descriptors')
          .delete()
          .eq('id', oldestSample.id);

        if (deleteError) {
          console.error('Error deleting oldest sample:', deleteError);
        } else {
          console.log(`Deleted oldest sample ${oldestSample.id} to make room for new one`);
        }
      }
    }

    // Upload image if provided
    let imageUrl: string | null = null;
    if (imageBlob) {
      try {
        const timestamp = Date.now();
        const fileName = `training_${userId}_${timestamp}.jpg`;
        const file = new File([imageBlob], fileName, { type: 'image/jpeg' });
        imageUrl = await uploadImage(file, `training/${userId}/${fileName}`);

        // Store organized attendance training sample in dedicated bucket/folder hierarchy
        await uploadAttendanceTrainingImage({
          imageBlob,
          studentId: userId,
          status: 'present',
          mode: 'ai-scan',
          confidence,
        });

        console.log('Training image uploaded:', imageUrl);
      } catch (uploadError) {
        console.error('Error uploading training image:', uploadError);
        // Continue without image
      }
    }

    // Store the new face descriptor
    const descriptorString = descriptorToString(faceDescriptor);
    
    const { error: insertError } = await supabase
      .from('face_descriptors')
      .insert({
        user_id: userId,
        descriptor: descriptorString,
        image_url: imageUrl,
        label: userName,
        metadata: confidence === 1.0 ? { registration: 'true' } : {}
      });

    if (insertError) {
      console.error('Error inserting face descriptor:', insertError);
      return false;
    }

    console.log(`Successfully stored training sample for user ${userId}`);
    return true;
  } catch (error) {
    console.error('Error in storeFaceSample:', error);
    return false;
  }
}

/**
 * Get all face descriptors for a user (for improved matching)
 */
export async function getUserFaceDescriptors(userId: string): Promise<Float32Array[]> {
  try {
    const { data, error } = await supabase
      .from('face_descriptors')
      .select('descriptor')
      .eq('user_id', userId);

    if (error) {
      console.error('Error fetching user face descriptors:', error);
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    return data.map(record => {
      const descriptor = record.descriptor;
      if (typeof descriptor === 'string') {
        return stringToDescriptor(descriptor);
      } else if (Array.isArray(descriptor)) {
        return new Float32Array(descriptor as number[]);
      } else if (descriptor && typeof descriptor === 'object') {
        const values = Object.values(descriptor) as number[];
        return new Float32Array(values);
      }
      return new Float32Array(128);
    }).filter(d => d.length === 128);
  } catch (error) {
    console.error('Error in getUserFaceDescriptors:', error);
    return [];
  }
}

/**
 * Get all users with their face descriptors for recognition
 * Returns averaged descriptors for better accuracy
 */
export async function getAllTrainedDescriptors(): Promise<Map<string, { 
  descriptors: Float32Array[], 
  averagedDescriptor: Float32Array,
  userName: string,
  sampleCount: number 
}>> {
  try {
    const { data, error } = await supabase
      .from('face_descriptors')
      .select('user_id, descriptor, label')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching all face descriptors:', error);
      return new Map();
    }

    if (!data || data.length === 0) {
      return new Map();
    }

    // Group descriptors by user
    const userDescriptors = new Map<string, { 
      descriptors: Float32Array[], 
      userName: string 
    }>();

    for (const record of data) {
      const userId = record.user_id;
      let descriptor: Float32Array;
      
      try {
        if (typeof record.descriptor === 'string') {
          descriptor = stringToDescriptor(record.descriptor);
        } else if (Array.isArray(record.descriptor)) {
          descriptor = new Float32Array(record.descriptor as number[]);
        } else if (record.descriptor && typeof record.descriptor === 'object') {
          // Handle JSON object format
          const values = Object.values(record.descriptor) as number[];
          descriptor = new Float32Array(values);
        } else {
          continue;
        }

        if (descriptor.length !== 128) continue;
        if (!userDescriptors.has(userId)) {
          userDescriptors.set(userId, {
            descriptors: [],
            userName: record.label || 'Unknown'
          });
        }

        userDescriptors.get(userId)!.descriptors.push(descriptor);
      } catch (e) {
        console.error('Error processing descriptor:', e);
      }
    }

    // Calculate averaged descriptors for each user
    const result = new Map<string, { 
      descriptors: Float32Array[], 
      averagedDescriptor: Float32Array,
      userName: string,
      sampleCount: number 
    }>();

    for (const [userId, data] of userDescriptors) {
      const averaged = averageDescriptors(data.descriptors);
      result.set(userId, {
        descriptors: data.descriptors,
        averagedDescriptor: averaged,
        userName: data.userName,
        sampleCount: data.descriptors.length
      });
    }

    console.log(`Loaded ${result.size} users with trained face descriptors`);
    return result;
  } catch (error) {
    console.error('Error in getAllTrainedDescriptors:', error);
    return new Map();
  }
}

/**
 * Average multiple face descriptors for more robust matching
 */
function averageDescriptors(descriptors: Float32Array[]): Float32Array {
  if (descriptors.length === 0) {
    return new Float32Array(128);
  }

  if (descriptors.length === 1) {
    return descriptors[0];
  }

  const averaged = new Float32Array(128);
  
  for (let i = 0; i < 128; i++) {
    let sum = 0;
    for (const descriptor of descriptors) {
      sum += descriptor[i];
    }
    averaged[i] = sum / descriptors.length;
  }

  // Normalize the averaged descriptor
  let magnitude = 0;
  for (let i = 0; i < 128; i++) {
    magnitude += averaged[i] * averaged[i];
  }
  magnitude = Math.sqrt(magnitude);

  if (magnitude > 0) {
    for (let i = 0; i < 128; i++) {
      averaged[i] /= magnitude;
    }
  }

  return averaged;
}

/**
 * Get training statistics for a user
 */
export async function getUserTrainingStats(userId: string): Promise<{
  sampleCount: number;
  oldestSample: Date | null;
  newestSample: Date | null;
  trainingLevel: 'none' | 'basic' | 'moderate' | 'good' | 'excellent';
}> {
  try {
    const { data, error } = await supabase
      .from('face_descriptors')
      .select('created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error || !data || data.length === 0) {
      return {
        sampleCount: 0,
        oldestSample: null,
        newestSample: null,
        trainingLevel: 'none'
      };
    }

    const sampleCount = data.length;
    let trainingLevel: 'none' | 'basic' | 'moderate' | 'good' | 'excellent';
    
    if (sampleCount === 0) trainingLevel = 'none';
    else if (sampleCount < 3) trainingLevel = 'basic';
    else if (sampleCount < 5) trainingLevel = 'moderate';
    else if (sampleCount < 8) trainingLevel = 'good';
    else trainingLevel = 'excellent';

    return {
      sampleCount,
      oldestSample: new Date(data[0].created_at),
      newestSample: new Date(data[data.length - 1].created_at),
      trainingLevel
    };
  } catch (error) {
    console.error('Error in getUserTrainingStats:', error);
    return {
      sampleCount: 0,
      oldestSample: null,
      newestSample: null,
      trainingLevel: 'none'
    };
  }
}

/**
 * Get overall training statistics
 */
export async function getTrainingStats(): Promise<{
  totalSamples: number;
  usersWithSamples: number;
  averageSamplesPerUser: number;
}> {
  try {
    const { data, error } = await supabase
      .from('face_descriptors')
      .select('user_id');

    if (error || !data) {
      return { totalSamples: 0, usersWithSamples: 0, averageSamplesPerUser: 0 };
    }

    const userCounts = new Map<string, number>();
    data.forEach(record => {
      const count = userCounts.get(record.user_id) || 0;
      userCounts.set(record.user_id, count + 1);
    });

    const usersWithSamples = userCounts.size;
    const totalSamples = data.length;
    const averageSamplesPerUser = usersWithSamples > 0 ? totalSamples / usersWithSamples : 0;

    return { totalSamples, usersWithSamples, averageSamplesPerUser };
  } catch (error) {
    console.error('Error in getTrainingStats:', error);
    return { totalSamples: 0, usersWithSamples: 0, averageSamplesPerUser: 0 };
  }
}

/**
 * Get all users with their training sample counts
 */
export async function getUsersWithTrainingSamples(): Promise<Array<{
  userId: string;
  sampleCount: number;
}>> {
  try {
    const { data, error } = await supabase
      .from('face_descriptors')
      .select('user_id');

    if (error || !data) {
      return [];
    }

    const userCounts = new Map<string, number>();
    data.forEach(record => {
      const count = userCounts.get(record.user_id) || 0;
      userCounts.set(record.user_id, count + 1);
    });

    return Array.from(userCounts.entries()).map(([userId, sampleCount]) => ({
      userId,
      sampleCount
    }));
  } catch (error) {
    console.error('Error in getUsersWithTrainingSamples:', error);
    return [];
  }
}

/**
 * Calculate minimum distance using all stored descriptors
 * Uses both individual sample matching AND averaged descriptor
 * Multi-angle 3D scan data gives much better matching accuracy
 */
export function calculateBestMatchDistance(
  inputDescriptor: Float32Array,
  userDescriptors: Float32Array[],
  averagedDescriptor: Float32Array
): number {
  // Compare against averaged descriptor (good for general match)
  let bestDistance = calculateDistance(inputDescriptor, averagedDescriptor);
  
  // Compare against individual samples - especially useful with 3D scan data
  // because the input face angle may closely match one of the registered angles
  for (const descriptor of userDescriptors) {
    const distance = calculateDistance(inputDescriptor, descriptor);
    if (distance < bestDistance) {
      bestDistance = distance;
    }
  }
  
  // Also compute cosine similarity for additional confidence
  const cosineDist = cosineDistance(inputDescriptor, averagedDescriptor);
  
  // Use the better of euclidean and cosine distance
  return Math.min(bestDistance, cosineDist);
}

function calculateDistance(descriptor1: Float32Array, descriptor2: Float32Array): number {
  if (descriptor1.length !== descriptor2.length) {
    return Infinity;
  }
  
  let sum = 0;
  for (let i = 0; i < descriptor1.length; i++) {
    const diff = descriptor1[i] - descriptor2[i];
    sum += diff * diff;
  }
  
  return Math.sqrt(sum);
}

function cosineDistance(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return Infinity;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const similarity = dot / (Math.sqrt(magA) * Math.sqrt(magB));
  // Convert cosine similarity (1=same, 0=different) to distance-like metric
  return Math.sqrt(2 * (1 - similarity));
}
