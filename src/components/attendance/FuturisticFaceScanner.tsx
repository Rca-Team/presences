import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Webcam from 'react-webcam';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  loadModels, 
  areModelsLoaded,
  getFaceDescriptor
} from '@/services/face-recognition/ModelService';
import {
  recognizeFace,
  recordAttendance
} from '@/services/face-recognition/RecognitionService';
import { saveEmotionEvent } from '@/services/ai/EmotionAnalysisService';
import { sendAutoParentNotification } from '@/services/notification/AutoNotificationService';
import { getCutoffTime, isPastCutoffTime, getAttendanceCutoffTime } from '@/services/attendance/AttendanceSettingsService';
import * as faceapi from 'face-api.js';
import {
  Camera,
  Scan,
  CheckCircle,
  AlertCircle,
  User,
  Zap,
  RefreshCw,
  Sparkles,
  Eye,
  Shield,
  Activity,
  Cpu,
  Target,
  Wifi,
  Power,
  Users
} from 'lucide-react';
import LiveFaceOverlay, { RecognizedFaceData } from './LiveFaceOverlay';

interface FuturisticFaceScannerProps {
  onScanComplete?: (result: { recognized: boolean; name?: string; confidence?: number }) => void;
}

interface DetectedFace {
  box: { x: number; y: number; width: number; height: number };
  descriptor?: Float32Array;
}

interface PendingManualReview {
  id: string;
  employee: {
    id: string;
    name: string;
    employee_id?: string;
    avatar_url?: string;
    firebase_image_url?: string;
  };
  status: 'present' | 'late';
  confidence: number;
  strictScore: number;
  thresholdTarget: number;
  capturedImageDataUrl?: string;
}

const FuturisticFaceScanner: React.FC<FuturisticFaceScannerProps> = ({ onScanComplete }) => {
  const { toast } = useToast();
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const detectionIntervalRef = useRef<number | null>(null);
  
  const [modelsLoaded, setModelsLoaded] = useState(areModelsLoaded());
  const [isScanning, setIsScanning] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [scanPhase, setScanPhase] = useState<'idle' | 'detecting' | 'analyzing' | 'matching' | 'complete'>('idle');
  const [scanResult, setScanResult] = useState<{ recognized: boolean; name?: string; confidence?: number } | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [detectedFaces, setDetectedFaces] = useState<DetectedFace[]>([]);
  const [faceCount, setFaceCount] = useState(0);
  const [recognizedFaces, setRecognizedFaces] = useState<RecognizedFaceData[]>([]);
  const [pendingManualReviews, setPendingManualReviews] = useState<PendingManualReview[]>([]);
  const [isSavingReviewId, setIsSavingReviewId] = useState<string | null>(null);
  const [containerDimensions, setContainerDimensions] = useState({ width: 0, height: 0 });
  const [systemStatus, setSystemStatus] = useState({
    neural: true,
    biometric: true,
    cloud: navigator.onLine,
    recognition: true
  });

  // Track container dimensions for overlay positioning
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setContainerDimensions({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight
        });
      }
    };
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  useEffect(() => {
    const initModels = async () => {
      if (!areModelsLoaded()) {
        await loadModels();
        setModelsLoaded(true);
      }
      // Pre-load SSD MobileNetV1 so first scan doesn't timeout
      if (!faceapi.nets.ssdMobilenetv1?.isLoaded) {
        try {
          await faceapi.nets.ssdMobilenetv1.load('/models');
          console.log('SSD MobileNetV1 pre-loaded for scanning');
        } catch (e) {
          console.warn('SSD MobileNetV1 pre-load failed, will use TinyFaceDetector', e);
        }
      }
    };
    initModels();
  }, []);

  // Real-time face detection
  useEffect(() => {
    if (!modelsLoaded || isScanning) {
      if (detectionIntervalRef.current) {
        window.clearInterval(detectionIntervalRef.current);
        detectionIntervalRef.current = null;
      }
      return;
    }

    const detectFaces = async () => {
      if (!webcamRef.current?.video || isScanning) return;
      
      const video = webcamRef.current.video;
      if (video.readyState !== 4) return;

      try {
        const detections = await faceapi
          .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
          .withFaceLandmarks();

        const faces: DetectedFace[] = detections.map(d => ({
          box: {
            x: d.detection.box.x,
            y: d.detection.box.y,
            width: d.detection.box.width,
            height: d.detection.box.height
          }
        }));

        setDetectedFaces(faces);
        setFaceCount(faces.length);

        // Draw on canvas
        if (canvasRef.current) {
          const ctx = canvasRef.current.getContext('2d');
          if (ctx) {
            canvasRef.current.width = video.videoWidth;
            canvasRef.current.height = video.videoHeight;
            ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

            faces.forEach((face, i) => {
              // Draw face box
              ctx.strokeStyle = '#22d3ee';
              ctx.lineWidth = 3;
              ctx.strokeRect(face.box.x, face.box.y, face.box.width, face.box.height);

              // Draw corner brackets
              const cornerSize = 15;
              ctx.strokeStyle = '#06b6d4';
              ctx.lineWidth = 4;
              
              // Top-left
              ctx.beginPath();
              ctx.moveTo(face.box.x, face.box.y + cornerSize);
              ctx.lineTo(face.box.x, face.box.y);
              ctx.lineTo(face.box.x + cornerSize, face.box.y);
              ctx.stroke();

              // Top-right
              ctx.beginPath();
              ctx.moveTo(face.box.x + face.box.width - cornerSize, face.box.y);
              ctx.lineTo(face.box.x + face.box.width, face.box.y);
              ctx.lineTo(face.box.x + face.box.width, face.box.y + cornerSize);
              ctx.stroke();

              // Bottom-left
              ctx.beginPath();
              ctx.moveTo(face.box.x, face.box.y + face.box.height - cornerSize);
              ctx.lineTo(face.box.x, face.box.y + face.box.height);
              ctx.lineTo(face.box.x + cornerSize, face.box.y + face.box.height);
              ctx.stroke();

              // Bottom-right
              ctx.beginPath();
              ctx.moveTo(face.box.x + face.box.width - cornerSize, face.box.y + face.box.height);
              ctx.lineTo(face.box.x + face.box.width, face.box.y + face.box.height);
              ctx.lineTo(face.box.x + face.box.width, face.box.y + face.box.height - cornerSize);
              ctx.stroke();

              // Face number label
              ctx.fillStyle = '#06b6d4';
              ctx.font = 'bold 14px Inter';
              ctx.fillText(`Face ${i + 1}`, face.box.x, face.box.y - 8);
            });
          }
        }
      } catch (error) {
        console.error('Face detection error:', error);
      }
    };

    setIsDetecting(true);
    detectionIntervalRef.current = window.setInterval(detectFaces, 200);

    return () => {
      if (detectionIntervalRef.current) {
        window.clearInterval(detectionIntervalRef.current);
        detectionIntervalRef.current = null;
      }
      setIsDetecting(false);
    };
  }, [modelsLoaded, isScanning]);

  // Helper to create a timeout promise for biometric operations
  const withTimeout = <T,>(promise: Promise<T>, ms: number, errorMessage: string): Promise<T> => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(errorMessage));
      }, ms);
      
      promise
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  };

  const scanFace = useCallback(async () => {
    if (!webcamRef.current || !modelsLoaded || faceCount === 0) {
      toast({
        title: 'No Face Detected',
        description: 'Please position your face in the camera frame',
        variant: 'destructive'
      });
      return;
    }

    // Stop detection during scan
    if (detectionIntervalRef.current) {
      window.clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }

    setIsScanning(true);
    setScanPhase('detecting');
    setScanResult(null);
    setRecognizedFaces([]);

    // Overall scan timeout - 25 seconds max (first scan may need model loading)
    const scanTimeout = setTimeout(() => {
      console.warn('Scan timeout - forcing completion');
      setIsScanning(false);
      setScanPhase('idle');
      setScanResult({ recognized: false });
      toast({
        title: "Scan Timeout",
        description: "The scan took too long. Please try again.",
        variant: "destructive"
      });
    }, 25000);

    try {
      const video = webcamRef.current.video;
      if (!video) throw new Error('Video not available');

      // Phase 1: Detecting all faces with descriptors
      await new Promise(r => setTimeout(r, 400));
      setScanPhase('analyzing');

      // Detect all faces with full descriptors
      // Use whichever detector is already loaded (prefer SSD, fallback to TinyFaceDetector)
      const useSsd = faceapi.nets.ssdMobilenetv1?.isLoaded;
      console.log(`Using ${useSsd ? 'SSD MobileNetV1' : 'TinyFaceDetector'} for scan`);

      const detectionPromise: Promise<faceapi.WithFaceDescriptor<faceapi.WithFaceLandmarks<{ detection: faceapi.FaceDetection }, faceapi.FaceLandmarks68>>[]> = useSsd
        ? faceapi
            .detectAllFaces(video, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.4 }))
            .withFaceLandmarks()
            .withFaceDescriptors()
            .run()
        : faceapi
            .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 }))
            .withFaceLandmarks()
            .withFaceDescriptors()
            .run();

      const fullDetections = await withTimeout(
        detectionPromise,
        20000,
        'Face detection timed out. Please ensure good lighting and try again.'
      );
      const capturedImageDataUrl = webcamRef.current?.getScreenshot() || undefined;

      console.log(`Found ${fullDetections.length} faces to process`);

      if (fullDetections.length === 0) {
        throw new Error('No faces detected in frame');
      }

      await new Promise(r => setTimeout(r, 400));
      setScanPhase('matching');

      // Process all detected faces
      const results: RecognizedFaceData[] = [];
      const reviewQueue: PendingManualReview[] = [];
      let recognizedCount = 0;

      // Get cutoff time from settings - with timeout
      let cutoffTimeObj = { hour: 9, minute: 0 };
      let isPastCutoff = false;
      try {
        cutoffTimeObj = await withTimeout(getAttendanceCutoffTime(), 3000, 'Cutoff time fetch failed');
        isPastCutoff = isPastCutoffTime(cutoffTimeObj);
      } catch (e) {
        console.warn('Using default cutoff time:', e);
        isPastCutoff = isPastCutoffTime(cutoffTimeObj);
      }
      
      // Process faces with individual timeouts
      for (const detection of fullDetections) {
        const box = detection.detection.box;
        const descriptor = detection.descriptor;
        
        try {
          // Recognition with 5 second timeout per face
          const result = await withTimeout(
            recognizeFace(descriptor),
            5000,
            'Face recognition timed out'
          );
          
          if (result.recognized && result.employee) {
            const status = isPastCutoff ? 'late' : 'present';
            const strictMetrics = result.strictMetrics;
            const strictScore = strictMetrics?.fusedScore ?? (result.confidence ?? 0);
            const thresholdTarget = strictMetrics?.thresholdTarget ?? 0.5;
            const autoMarkEligible =
              strictScore >= thresholdTarget ||
              !!strictMetrics?.autoMarkEligible;

            saveEmotionEvent({
              userId: result.employee.id,
              studentId: result.employee.employee_id || result.employee.id,
              source: 'ai-scan',
              descriptor,
              recognitionConfidence: result.confidence,
              metadata: {
                student_name: result.employee.name,
                strict_mode: true,
                strict_score: strictScore,
                strict_threshold_target: thresholdTarget,
                auto_mark_eligible: autoMarkEligible,
              },
            }).then();
            
            if (autoMarkEligible) {
              try {
                await withTimeout(
                  recordAttendance(
                    result.employee.id,
                    status,
                    result.confidence,
                    {
                      metadata: {
                        name: result.employee.name,
                        strict_mode: true,
                        strict_fused_score: strictScore,
                        strict_threshold_target: thresholdTarget,
                      },
                    },
                    capturedImageDataUrl,
                  ),
                  5000,
                  'Attendance recording timed out'
                );
                recognizedCount++;
              } catch (recordErr) {
                console.error('Failed to record attendance:', recordErr);
              }

              sendAutoParentNotification(
                result.employee.id,
                result.employee.name || 'Student',
                status,
                result.employee.avatar_url || result.employee.firebase_image_url
              ).catch(err => console.error('Auto notification error:', err));

              results.push({
                id: result.employee.id,
                name: result.employee.name || 'Unknown',
                status,
                confidence: (result.confidence ?? 0) * 100,
                strictScore,
                thresholdTarget,
                imageUrl: result.employee.avatar_url || result.employee.firebase_image_url,
                box: { x: box.x, y: box.y, width: box.width, height: box.height }
              });
            } else {
              reviewQueue.push({
                id: `${result.employee.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                employee: {
                  id: result.employee.id,
                  name: result.employee.name || 'Unknown',
                  employee_id: result.employee.employee_id,
                  avatar_url: result.employee.avatar_url,
                  firebase_image_url: result.employee.firebase_image_url,
                },
                status,
                confidence: result.confidence ?? 0,
                strictScore,
                thresholdTarget,
                capturedImageDataUrl,
              });

              results.push({
                id: `review-${result.employee.id}`,
                name: result.employee.name || 'Unknown',
                status: 'review',
                confidence: (result.confidence ?? 0) * 100,
                strictScore,
                thresholdTarget,
                imageUrl: result.employee.avatar_url || result.employee.firebase_image_url,
                box: { x: box.x, y: box.y, width: box.width, height: box.height }
              });
            }
          } else {
            results.push({
              id: `unknown-${Math.random().toString(36).substr(2, 9)}`,
              name: 'Unknown',
              status: 'unrecognized',
              confidence: detection.detection.score * 100,
              box: { x: box.x, y: box.y, width: box.width, height: box.height }
            });
          }
        } catch (recognitionErr) {
          console.error('Recognition error for face:', recognitionErr);
          results.push({
            id: `error-${Math.random().toString(36).substr(2, 9)}`,
            name: 'Unknown',
            status: 'unrecognized',
            confidence: detection.detection.score * 100,
            box: { x: box.x, y: box.y, width: box.width, height: box.height }
          });
        }
      }

      clearTimeout(scanTimeout);
      await new Promise(r => setTimeout(r, 300));
      setScanPhase('complete');
      setRecognizedFaces(results);
      setPendingManualReviews(reviewQueue);

      // Set scan result for primary face (first recognized, or first in list)
      const primaryResult = results.find(r => r.status === 'present' || r.status === 'late' || r.status === 'review') || results[0];
      if (primaryResult && (primaryResult.status === 'present' || primaryResult.status === 'late')) {
        setScanResult({
          recognized: true,
          name: primaryResult.name,
          confidence: primaryResult.confidence
        });
      } else if (primaryResult?.status === 'review') {
        setScanResult({
          recognized: false,
          name: primaryResult.name,
          confidence: primaryResult.confidence,
        });
      } else {
        setScanResult({ recognized: false });
      }

      // Show summary toast
      const unrecognizedCount = results.length - recognizedCount;
      const reviewCount = reviewQueue.length;
      if (recognizedCount > 0) {
        toast({
          title: `✓ ${recognizedCount} Attendance${recognizedCount > 1 ? 's' : ''} Recorded`,
          description: reviewCount > 0
            ? `${reviewCount} scan${reviewCount > 1 ? 's' : ''} requires manual confirmation`
            : unrecognizedCount > 0
              ? `${unrecognizedCount} face${unrecognizedCount > 1 ? 's' : ''} not recognized`
              : `All ${recognizedCount} face${recognizedCount > 1 ? 's' : ''} auto-validated in strict mode!`,
        });
      } else if (reviewCount > 0) {
        toast({
          title: 'Manual Confirmation Required',
          description: `${reviewCount} candidate${reviewCount > 1 ? 's' : ''} is below strict 50% threshold.`,
        });
      } else {
        toast({
          title: "No Faces Recognized",
          description: `${results.length} face${results.length > 1 ? 's' : ''} detected but not registered`,
          variant: "destructive"
        });
      }
      
      onScanComplete?.({ 
        recognized: recognizedCount > 0, 
        name: primaryResult?.name,
        confidence: primaryResult?.confidence
      });

    } catch (err) {
      clearTimeout(scanTimeout);
      console.error('Scan error:', err);
      setScanPhase('complete');
      setScanResult({ recognized: false });
      toast({
        title: "Scan Failed",
        description: err instanceof Error ? err.message : "Unknown error occurred",
        variant: "destructive"
      });
    } finally {
      setTimeout(() => {
        setIsScanning(false);
        setScanPhase('idle');
        // Keep recognized faces visible for a moment longer
        setTimeout(() => setRecognizedFaces([]), 3000);
      }, 2000);
    }
  }, [modelsLoaded, faceCount, onScanComplete, toast]);

  const confirmManualReview = useCallback(async (review: PendingManualReview) => {
    try {
      setIsSavingReviewId(review.id);
      await recordAttendance(
        review.employee.id,
        review.status,
        review.confidence,
        {
          metadata: {
            name: review.employee.name,
            employee_id: review.employee.employee_id,
            strict_mode: true,
            strict_fused_score: review.strictScore,
            strict_threshold_target: review.thresholdTarget,
            manual_confirmation: true,
            force_attendance_save: true,
          },
        },
        review.capturedImageDataUrl,
      );

      sendAutoParentNotification(
        review.employee.id,
        review.employee.name || 'Student',
        review.status,
        review.employee.avatar_url || review.employee.firebase_image_url,
      ).catch(err => console.error('Auto notification error:', err));

      setPendingManualReviews((prev) => prev.filter((item) => item.id !== review.id));
      toast({
        title: 'Attendance Confirmed',
        description: `${review.employee.name} marked as ${review.status} after manual verification.`,
      });
    } catch (error) {
      console.error('Manual confirmation failed:', error);
      toast({
        title: 'Could not confirm attendance',
        description: 'Please retry confirmation.',
        variant: 'destructive',
      });
    } finally {
      setIsSavingReviewId(null);
    }
  }, [toast]);

  const rejectManualReview = useCallback((reviewId: string) => {
    setPendingManualReviews((prev) => prev.filter((item) => item.id !== reviewId));
  }, []);

  const resetScanner = () => {
    setScanResult(null);
    setScanPhase('idle');
    setIsScanning(false);
    setRecognizedFaces([]);
    setPendingManualReviews([]);
  };

  return (
    <div className="relative w-full">
      {/* Face Count Badge */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="absolute top-0 left-0 right-0 z-20 flex justify-center -mt-12"
      >
        <div className={`flex items-center gap-2 px-4 py-2 rounded-full backdrop-blur-sm border shadow-lg ${
          faceCount > 0 
            ? 'bg-green-500/20 border-green-500/30 text-green-400' 
            : 'bg-slate-900/80 border-cyan-500/30 text-cyan-400'
        }`}>
          <Users className="w-4 h-4" />
          <span className="font-bold">{faceCount}</span>
          <span className="text-sm">Face{faceCount !== 1 ? 's' : ''} Detected</span>
          {faceCount > 0 && (
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
              className="w-2 h-2 rounded-full bg-green-400"
            />
          )}
        </div>
      </motion.div>

      {/* Scanner Container */}
      <div ref={containerRef} className="relative aspect-[4/5] sm:aspect-video rounded-2xl overflow-hidden bg-slate-950 shadow-2xl shadow-cyan-500/20">
        {/* Tech Grid Background */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute inset-0" style={{
            backgroundImage: `
              linear-gradient(rgba(6,182,212,0.1) 1px, transparent 1px),
              linear-gradient(90deg, rgba(6,182,212,0.1) 1px, transparent 1px)
            `,
            backgroundSize: '20px 20px'
          }} />
        </div>

        {/* Webcam Feed */}
        <Webcam
          ref={webcamRef}
          audio={false}
          screenshotFormat="image/jpeg"
          className="absolute inset-0 w-full h-full object-cover"
          mirrored={facingMode === 'user'}
          videoConstraints={{
            facingMode,
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }}
        />

        {/* Face Detection Canvas */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }}
        />

        {/* Live Face Recognition Overlay */}
        <LiveFaceOverlay
          faces={recognizedFaces}
          containerWidth={containerDimensions.width}
          containerHeight={containerDimensions.height}
          mirrored={facingMode === 'user'}
        />

        {/* Scanning Overlay */}
        <AnimatePresence>
          {isScanning && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm z-10"
            >
              {/* Central Scanner */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative">
                  {/* Outer Rings */}
                  {[1, 2, 3].map((ring) => (
                    <motion.div
                      key={ring}
                      className="absolute rounded-full border-2 border-cyan-400/30"
                      style={{
                        width: `${140 + ring * 35}px`,
                        height: `${140 + ring * 35}px`,
                        left: `${-17.5 - ring * 17.5}px`,
                        top: `${-17.5 - ring * 17.5}px`,
                      }}
                      animate={{
                        scale: [1, 1.05, 1],
                        opacity: [0.3, 0.6, 0.3],
                      }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        delay: ring * 0.2,
                      }}
                    />
                  ))}

                  {/* Rotating Scanner Ring */}
                  <motion.div
                    className="w-36 h-36 rounded-full"
                    style={{
                      background: 'conic-gradient(from 0deg, transparent, #06b6d4, transparent)',
                    }}
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  />

                  {/* Inner Circle */}
                  <motion.div
                    className="absolute inset-4 rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border-2 border-cyan-400 flex items-center justify-center"
                    animate={{
                      boxShadow: [
                        '0 0 20px rgba(6,182,212,0.3)',
                        '0 0 40px rgba(6,182,212,0.5)',
                        '0 0 20px rgba(6,182,212,0.3)',
                      ],
                    }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    {scanPhase === 'complete' && scanResult?.recognized ? (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring' }}
                      >
                        <CheckCircle className="w-14 h-14 text-green-400" />
                      </motion.div>
                    ) : scanPhase === 'complete' && !scanResult?.recognized ? (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring' }}
                      >
                        <AlertCircle className="w-14 h-14 text-red-400" />
                      </motion.div>
                    ) : (
                      <motion.div
                        animate={{ scale: [1, 1.1, 1] }}
                        transition={{ duration: 1, repeat: Infinity }}
                      >
                        <Eye className="w-10 h-10 text-cyan-400" />
                      </motion.div>
                    )}
                  </motion.div>
                </div>

                {/* Scanning Line */}
                <motion.div
                  className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent"
                  animate={{ top: ['20%', '80%', '20%'] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                />
              </div>

              {/* Phase Indicator */}
              <motion.div
                className="absolute bottom-16 left-0 right-0 text-center"
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1, repeat: Infinity }}
              >
                <p className={`text-base sm:text-lg font-bold ${
                  scanPhase === 'complete' && scanResult?.recognized ? 'text-green-400' :
                  scanPhase === 'complete' && !scanResult?.recognized ? 'text-red-400' :
                  'text-cyan-400'
                }`}>
                  {scanPhase === 'detecting' && '◎ DETECTING FACE...'}
                  {scanPhase === 'analyzing' && '◉ ANALYZING BIOMETRICS...'}
                  {scanPhase === 'matching' && '⚡ MATCHING DATABASE...'}
                  {scanPhase === 'complete' && scanResult?.recognized && `✓ RECOGNIZED: ${scanResult.name}`}
                  {scanPhase === 'complete' && !scanResult?.recognized && '✗ UNRECOGNIZED'}
                </p>
                {scanResult?.confidence && (
                  <p className="text-sm text-cyan-300 mt-1">
                    Match Confidence: {Math.round(scanResult.confidence)}%
                  </p>
                )}
              </motion.div>

              {/* Floating Particles */}
              {[...Array(10)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute w-1 h-1 bg-cyan-400 rounded-full"
                  style={{
                    left: `${Math.random() * 100}%`,
                    top: `${Math.random() * 100}%`,
                  }}
                  animate={{
                    y: [0, -25, 0],
                    opacity: [0, 1, 0],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    delay: i * 0.15,
                  }}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Status Bar */}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-10">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/80 backdrop-blur-sm border border-cyan-500/30">
            {Object.entries(systemStatus).map(([key, active]) => (
              <div 
                key={key} 
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full ${
                  active ? 'text-cyan-400' : 'text-red-400'
                }`}
              >
                <div className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-cyan-400' : 'bg-red-400'}`} />
                <span className="text-[10px] font-medium uppercase hidden sm:inline">{key}</span>
              </div>
            ))}
          </div>
          
        </div>

        {/* FPS Counter */}
        <div className="absolute top-3 right-3 px-2 py-1 rounded-lg bg-slate-900/80 backdrop-blur-sm border border-cyan-500/30 hidden sm:block">
          <div className="flex items-center gap-1 text-xs text-cyan-400">
            <Activity className="w-3 h-3" />
            <span>60 FPS</span>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 mt-6 justify-center">
        <Button
          variant="outline"
          size="lg"
          onClick={() => setFacingMode(f => f === 'user' ? 'environment' : 'user')}
          className="border-cyan-500/30 text-cyan-600 hover:bg-cyan-500/10"
        >
          <RefreshCw className="w-5 h-5 mr-2" />
          Flip
        </Button>

        <Button
          size="lg"
          onClick={isScanning ? resetScanner : scanFace}
          disabled={!modelsLoaded || (faceCount === 0 && !isScanning)}
          className={`px-6 sm:px-8 ${
            isScanning 
              ? 'bg-red-500 hover:bg-red-600' 
              : faceCount > 0
                ? 'bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600'
                : 'bg-slate-600'
          } text-white shadow-lg ${isScanning ? 'shadow-red-500/25' : 'shadow-cyan-500/25'}`}
        >
          {!modelsLoaded ? (
            <>
              <Cpu className="w-5 h-5 mr-2 animate-spin" />
              Loading AI...
            </>
          ) : isScanning ? (
            <>
              <Power className="w-5 h-5 mr-2" />
              Cancel
            </>
          ) : faceCount === 0 ? (
            <>
              <Eye className="w-5 h-5 mr-2" />
              Position Face
            </>
          ) : (
            <>
              <Scan className="w-5 h-5 mr-2" />
              Scan {faceCount} Face{faceCount > 1 ? 's' : ''}
            </>
          )}
        </Button>
      </div>

      {pendingManualReviews.length > 0 && (
        <div className="mt-5 space-y-3 rounded-2xl border border-blue-500/30 bg-blue-500/10 p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-blue-200">
              Manual confirmation required ({pendingManualReviews.length})
            </p>
            <Badge variant="secondary" className="bg-blue-500/20 text-blue-200 border-blue-400/30">
              Strict 3D mode
            </Badge>
          </div>

          <div className="space-y-2">
            {pendingManualReviews.map((review) => (
              <div
                key={review.id}
                className="flex flex-col gap-2 rounded-xl border border-blue-400/30 bg-slate-950/40 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-medium text-white">{review.employee.name}</p>
                  <p className="text-xs text-blue-200/90">
                    Candidate {(review.confidence * 100).toFixed(1)}% • 3D score {(review.strictScore * 100).toFixed(1)}% • target {(review.thresholdTarget * 100).toFixed(0)}%
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => rejectManualReview(review.id)}
                    disabled={isSavingReviewId === review.id}
                    className="border-red-400/40 text-red-200 hover:bg-red-500/20"
                  >
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => confirmManualReview(review)}
                    disabled={isSavingReviewId === review.id}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    {isSavingReviewId === review.id ? 'Saving...' : 'Confirm'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 mt-5">
        {[
          { icon: Zap, label: 'Speed', value: '<0.5s', color: 'text-yellow-500' },
          { icon: Target, label: 'Accuracy', value: '50%', color: 'text-green-500' },
          { icon: Shield, label: 'Secure', value: 'AES-256', color: 'text-blue-500' },
        ].map((stat, i) => (
          <div key={i} className="flex flex-col items-center p-2 sm:p-3 rounded-xl bg-slate-900/50 border border-cyan-500/20">
            <stat.icon className={`w-4 h-4 sm:w-5 sm:h-5 ${stat.color} mb-1`} />
            <span className="text-base sm:text-lg font-bold text-white">{stat.value}</span>
            <span className="text-[10px] sm:text-xs text-muted-foreground">{stat.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FuturisticFaceScanner;
