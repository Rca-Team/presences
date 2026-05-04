
import * as faceapi from 'face-api.js';

// Initialize face-api models
let modelsLoaded = false;
let isLoadingModels = false;
let loadAttempts = 0;
const MAX_LOAD_ATTEMPTS = 5; // Increased from 3 to 5
const MODEL_PATHS = [
  { net: faceapi.nets.tinyFaceDetector, name: 'TinyFaceDetector' },
  { net: faceapi.nets.ssdMobilenetv1, name: 'SSD MobileNetV1' },
  { net: faceapi.nets.faceLandmark68Net, name: 'FaceLandmark68' },
  { net: faceapi.nets.faceRecognitionNet, name: 'FaceRecognition' }
];

// Helper function to simulate a delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function loadModels() {
  // Return if models already loaded
  if (modelsLoaded) {
    console.log('Face recognition models already loaded');
    return;
  }
  
  // Prevent concurrent loading attempts
  if (isLoadingModels) {
    console.log('Face recognition models are currently loading, please wait...');
    
    // Wait for the current loading process to complete
    return new Promise((resolve, reject) => {
      const checkLoaded = setInterval(() => {
        if (modelsLoaded) {
          clearInterval(checkLoaded);
          resolve(true);
        } else if (!isLoadingModels && !modelsLoaded) {
          // If loading failed but is no longer in progress
          clearInterval(checkLoaded);
          reject(new Error('Model loading failed'));
        }
      }, 500);
    });
  }
  
  isLoadingModels = true;
  loadAttempts++;
  
  try {
    console.log(`Loading face recognition models from /models (attempt ${loadAttempts}/${MAX_LOAD_ATTEMPTS})...`);
    
    // Check if models directory exists by attempting to fetch a manifest file
    try {
      const testResponse = await fetch('/models/ssd_mobilenetv1_model-weights_manifest.json');
      if (!testResponse.ok) {
        throw new Error(`Failed to access models directory: ${testResponse.status} ${testResponse.statusText}`);
      }
      
      // Log response for debugging
      console.log('Models directory access confirmed. Response status:', testResponse.status);
      
      // Try to parse the manifest to verify it's valid JSON
      try {
        const manifestText = await testResponse.text();
        console.log('Manifest content sample:', manifestText.substring(0, 100) + '...');
        JSON.parse(manifestText); // This will throw if invalid JSON
        console.log('Manifest JSON is valid');
      } catch (jsonError) {
        console.error('Invalid manifest JSON:', jsonError);
        throw new Error('Model manifest is not valid JSON');
      }
    } catch (error) {
      console.error('Models directory access error:', error);
      throw new Error(`Cannot access face recognition models: ${error.message}`);
    }
    
    // Add delay between model loads to prevent race conditions
    for (const model of MODEL_PATHS) {
      console.log(`Loading ${model.name} model...`);
      try {
        // Ensure previous model load had time to complete
        await delay(300);
        
        // If model is already loaded, skip it
        if (model.net.isLoaded) {
          console.log(`${model.name} model already loaded, skipping...`);
          continue;
        }
        
        // Log the model load path for debugging
        console.log(`Loading from: /models for ${model.name}`);
        await model.net.load('/models');
        
        // Verify model was actually loaded
        if (!model.net.isLoaded) {
          throw new Error(`${model.name} reported success but isLoaded is false`);
        }
        
        console.log(`${model.name} model loaded successfully`);
      } catch (modelError) {
        console.error(`Error loading ${model.name} model:`, modelError);
        throw new Error(`Failed to load ${model.name}: ${modelError.message}`);
      }
    }
    
    // Double-check all models are loaded
    const allLoaded = MODEL_PATHS.every(model => model.net.isLoaded);
    if (!allLoaded) {
      throw new Error('Some models reported as not loaded after loading process');
    }
    
    modelsLoaded = true;
    isLoadingModels = false;
    loadAttempts = 0;
    console.log('All face recognition models loaded successfully');
    return;
  } catch (error) {
    isLoadingModels = false;
    console.error('Error loading face recognition models:', error);
    
    // Add more detailed error logging
    if (error instanceof Error) {
      console.error('Model loading error details:', {
        message: error.message,
        stack: error.stack
      });
    }
    
    // Progressive retry with exponential backoff
    if (loadAttempts < MAX_LOAD_ATTEMPTS) {
      const backoffTime = Math.min(1000 * Math.pow(2, loadAttempts - 1), 10000);
      console.log(`Retrying model load in ${backoffTime}ms (attempt ${loadAttempts}/${MAX_LOAD_ATTEMPTS})...`);
      
      // Wait before retry with exponential backoff
      await delay(backoffTime);
      
      return loadModels(); // Recursive retry
    } else {
      console.error(`Failed to load models after ${MAX_LOAD_ATTEMPTS} attempts`);
      loadAttempts = 0; // Reset for future attempts
      throw new Error(`Failed to load face recognition models after ${MAX_LOAD_ATTEMPTS} attempts: ${error.message}`);
    }
  }
}

// Add a function to verify if models are loaded
export function areModelsLoaded() {
  return modelsLoaded;
}

// Add a function to force reload models
export async function forceReloadModels() {
  // Reset the loaded state
  modelsLoaded = false;
  isLoadingModels = false;
  loadAttempts = 0;
  
  // Attempt to reload models
  return loadModels();
}

// Helper functions for face descriptors
export function descriptorToString(descriptor: Float32Array): string {
  return JSON.stringify(Array.from(descriptor));
}

export function stringToDescriptor(str: string): Float32Array {
  return new Float32Array(JSON.parse(str));
}

// Get face descriptor from image with improved error handling
// Includes minimum face size filter to ignore distant faces
export async function getFaceDescriptor(
  imageElement: HTMLImageElement | HTMLVideoElement,
  minFaceSize: number = 80 // Minimum face size in pixels
): Promise<Float32Array | null> {
  try {
    if (!modelsLoaded) {
      console.log('Models not loaded, loading now...');
      await loadModels();
    }
    
    // Wait for the image/video to be fully loaded - with proper type checking
    if ((imageElement instanceof HTMLImageElement && !imageElement.complete) || 
        (imageElement instanceof HTMLVideoElement && 
         (imageElement.readyState < 2 || imageElement.videoWidth === 0))) {
      
      console.log('Media not ready, waiting...');
      await new Promise<void>((resolve) => {
        const checkReady = () => {
          if (imageElement instanceof HTMLVideoElement) {
            if (imageElement.readyState >= 2 && imageElement.videoWidth > 0) {
              resolve();
            } else {
              setTimeout(checkReady, 100);
            }
          } else if (imageElement instanceof HTMLImageElement && imageElement.complete) {
            resolve();
          } else {
            setTimeout(checkReady, 100);
          }
        };
        checkReady();
      });
    }
    
    console.log('Detecting face in image...', 
      imageElement instanceof HTMLVideoElement 
        ? `Video dimensions: ${imageElement.videoWidth}x${imageElement.videoHeight}` 
        : `Image dimensions: ${imageElement.width}x${imageElement.height}`
    );
    
    // Use SSD MobileNetV1 for higher accuracy detection
    const detectionOptions = new faceapi.SsdMobilenetv1Options({ 
      minConfidence: 0.4   // Permissive detection threshold
    });
    
    const detections = await faceapi.detectSingleFace(imageElement, detectionOptions)
      .withFaceLandmarks()
      .withFaceDescriptor();
    
    if (!detections) {
      console.log('No face detected in the image');
      return null;
    }
    
    // Check if face is large enough (close to camera)
    const box = detections.detection.box;
    const faceSize = Math.min(box.width, box.height);
    if (faceSize < minFaceSize) {
      console.log(`Face too small/far (${Math.round(faceSize)}px < ${minFaceSize}px min). Please move closer to the camera.`);
      return null;
    }
    
    console.log(`Face detected successfully (size: ${Math.round(faceSize)}px)`);
    return detections.descriptor;
  } catch (error) {
    console.error('Error getting face descriptor:', error);
    
    // If error happens due to models not loaded, try to reload them
    if (!modelsLoaded) {
      modelsLoaded = false; // Force reload
      try {
        await forceReloadModels();
        // Try detection again after reload
        return getFaceDescriptor(imageElement, minFaceSize);
      } catch (reloadError) {
        console.error('Error reloading models:', reloadError);
        return null;
      }
    }
    
    return null;
  }
}
