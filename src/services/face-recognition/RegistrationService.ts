
import { supabase } from '@/integrations/supabase/client';
import { uploadImage } from './StorageService';
import { v4 as uuidv4 } from 'uuid';
import { descriptorToString } from './ModelService';
import { uploadRegistrationTrainingImage } from './TrainingDataStorageService';

// Define an interface for the metadata to ensure type safety
export interface RegistrationMetadata {
  name: string;
  employee_id: string;
  department: string;
  position: string;
  firebase_image_url: string;
  faceDescriptor?: string; // Make this optional since it's added conditionally
}

export const registerFace = async (
  imageBlob: Blob,
  name: string,
  employee_id: string,
  department: string,
  position: string,
  userId: string | undefined,
  faceDescriptor?: Float32Array,
  parentContactInfo?: {
    phone?: string;
    parent_name?: string;
    parent_email?: string;
    parent_phone?: string;
    student_email?: string;
    roll_number?: string;
    blood_group?: string;
    medical_info?: string;
    transport_mode?: string;
    class_section?: string;
    address?: string;
  },
  category?: string
): Promise<any> => {
  try {
    console.log('Starting face registration process', {
      name,
      employee_id,
      department,
      position,
      hasDescriptor: !!faceDescriptor
    });
    
    let faceDescriptorString: string | null = null;
    
    if (!imageBlob || imageBlob.size === 0) {
      console.error('Invalid image blob provided');
      throw new Error('Invalid image: The image blob is empty or invalid');
    }
    
    if (!faceDescriptor) {
      console.warn('No face descriptor provided for registration. This may limit face recognition capabilities.');
    }
    
    // Create a proper File object from the blob
    const uniqueId = uuidv4();
    const file = new File([imageBlob], `face_${uniqueId}.jpg`, { type: 'image/jpeg' });

    // Per-student folder so each student's photos live together in storage.
    const folderId = (employee_id || userId || 'unassigned')
      .toString()
      .replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = `students/${folderId}/register_${uniqueId}.jpg`;
    console.log('Uploading with path:', filePath);
    
    // Always store registration images in Lovable Cloud storage
    const imageUrl = await uploadImage(file, filePath);
    console.log('Face image uploaded successfully:', imageUrl);
    
    // Also save the same face in organized registration-training storage hierarchy
    const registrationTrainingPath = await uploadRegistrationTrainingImage({
      imageBlob,
      studentId: employee_id || userId || uniqueId,
      employeeId: employee_id,
      category,
      label: 'registration-primary',
    });

    // Prepare metadata as a plain object that conforms to Json type
    const metadata: Record<string, any> = {
      name,
      employee_id,
      department,
      position,
      firebase_image_url: imageUrl,
      training_registration_path: registrationTrainingPath,
    };

    if (faceDescriptor) {
      faceDescriptorString = descriptorToString(faceDescriptor);
      console.log('Descriptor converted to string, length:', faceDescriptorString.length);
      metadata.faceDescriptor = faceDescriptorString;
    }
    
    // Create device info as a plain object that conforms to Json type
    const deviceInfo: Record<string, any> = {
      type: 'webcam',
      registration: 'true', // Must be string for RLS policy check
      metadata: {
        ...metadata,
        ...parentContactInfo
      },
      timestamp: new Date().toISOString()
    };

    console.log('Inserting attendance record with metadata');
    
    // Get authenticated user if available
    const { data: { user } } = await supabase.auth.getUser();
    
    // Use authenticated user's ID if available, otherwise use provided userId or null
    const effectiveUserId = user?.id || userId || null;
    console.log('Using user ID:', effectiveUserId);
    
    // Insert registration record - user_id can now be null since we removed FK constraint
    const insertData: Record<string, any> = {
      timestamp: new Date().toISOString(),
      status: 'registered',
      device_info: deviceInfo,
      image_url: imageUrl,
      face_descriptor: faceDescriptorString,
      category: category || 'A'
    };
    
    // Only include user_id if we have one
    if (effectiveUserId) {
      insertData.user_id = effectiveUserId;
    }

    // Try to insert
    let { data: recordData, error: recordError } = await supabase
      .from('attendance_records')
      .insert(insertData)
      .select()
      .single();

    if (recordError) {
      console.error('Error inserting attendance record:', recordError);
      throw new Error(`Error inserting attendance record: ${recordError.message}`);
    }

    console.log('Registration completed successfully:', recordData);
    return recordData;
  } catch (error: any) {
    console.error('Face registration failed:', error);
    throw error;
  }
};

export const uploadFaceImage = async (imageBlob: Blob): Promise<string> => {
  try {
    console.log('Starting face image upload, blob size:', imageBlob.size);
    
    // Validate the blob
    if (!imageBlob || imageBlob.size === 0) {
      throw new Error('Invalid image: The image blob is empty or invalid');
    }
    
    // Create a unique filename
    const uniqueId = uuidv4();
    const file = new File([imageBlob], `face_${uniqueId}.jpg`, { type: 'image/jpeg' });
    const filePath = `${uniqueId}.jpg`;
    
    console.log('Uploading image as:', filePath);
    
    // Use our storage service upload function with 'public' bucket only
    const publicUrl = await uploadImage(file, filePath);
    console.log('Image uploaded successfully:', publicUrl);
    return publicUrl;
  } catch (error) {
    console.error('Error uploading face image:', error);
    throw error;
  }
};

// Store unrecognized face
export const storeUnrecognizedFace = async (imageData: string): Promise<void> => {
  try {
    console.log('Storing unrecognized face');
    
    // Convert base64 image data to a Blob
    const response = await fetch(imageData);
    const blob = await response.blob();
    
    if (!blob || blob.size === 0) {
      console.error('Failed to convert image data to blob');
      return;
    }
    
    // Always store unrecognized captures in Lovable Cloud storage
    const imageUrl = await uploadFaceImage(blob);
    
    // Create a device info object with the current timestamp as a plain object
    const deviceInfo: Record<string, any> = {
      type: 'webcam',
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
      firebase_image_url: imageUrl,
    };
    
    // Insert a record with status "unauthorized"
    const { error } = await supabase
      .from('attendance_records')
      .insert({
        user_id: null, // No user associated
        status: 'unauthorized',
        device_info: deviceInfo,
        image_url: imageUrl,
      });
    
    if (error) {
      console.error('Error storing unrecognized face:', error);
    } else {
      console.log('Unrecognized face stored successfully');
    }
  } catch (error) {
    console.error('Failed to store unrecognized face:', error);
  }
};
