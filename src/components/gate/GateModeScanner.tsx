import React, { useRef, useEffect, useCallback, useState } from 'react';
import { Eye, Loader2, Scan, Zap, ShieldCheck, ShieldAlert, SwitchCamera, Wand2, Square, Save, X as XIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { GateEntry } from '@/pages/GateMode';
import { loadModels, areModelsLoaded } from '@/services/face-recognition/ModelService';
import { recognizeFace, recordAttendance } from '@/services/face-recognition/RecognitionService';
import { usePhotoEnhancer } from '@/hooks/usePhotoEnhancer';
import * as faceapi from 'face-api.js';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '@/integrations/supabase/client';
import DetectionBoxEditor from './DetectionBoxEditor';
import { saveEmotionEvent } from '@/services/ai/EmotionAnalysisService';

interface GateModeScannerProps {
  onFaceDetected: (entry: GateEntry) => void;
  isActive: boolean;
  onPendingCountChange?: (count: number) => void;
  periodKey?: string;
  className?: string;
  section?: string;
  subject?: string;
  aiEnhancerEnabled?: boolean;
  cutoffHour?: number;
  cutoffMinute?: number;
}

interface LiveConfidence {
  name: string;
  confidence: number;
  recognized: boolean;
  timestamp: number;
}

// Detection zone — values are 0-1 (relative to displayed video) so it scales across resolutions.
interface DetectionBox {
  x: number; // 0..1
  y: number; // 0..1
  w: number; // 0..1
  h: number; // 0..1
}

const GateModeScanner = ({
  onFaceDetected,
  isActive,
  onPendingCountChange,
  periodKey,
  className,
  section,
  subject,
  aiEnhancerEnabled = true,
  cutoffHour = 9,
  cutoffMinute = 0,
}: GateModeScannerProps) => {
  const REDETECTION_COOLDOWN_MS = 5000;
  const DUPLICATE_COOLDOWN_MS = 30000;
  const MIN_RECOGNITION_CONFIDENCE = 0.72;
  const MIN_ATTENDANCE_MARK_CONFIDENCE = 0.84;
  const BORDERLINE_RETRY_CONFIDENCE = 0.7;
  const MIN_LIVENESS_DETECTION_SCORE = 0.87;
  const STABILITY_WINDOW_MS = 8000;
  const STABILITY_REQUIRED_HITS = 2;

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [fps, setFps] = useState(0);
  const [facesInFrame, setFacesInFrame] = useState(0);
  const [liveMatches, setLiveMatches] = useState<LiveConfidence[]>([]);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [detectionBox, setDetectionBox] = useState<DetectionBox | null>(null);
  const [editingBox, setEditingBox] = useState(false);
  const [gateId, setGateId] = useState<string | null>(null);
  const processingRef = useRef(false);
  const cooldownRef = useRef<Map<string, number>>(new Map());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const detectionIntervalMsRef = useRef(200);
  const fpsCounterRef = useRef({ frames: 0, lastTime: Date.now() });
  const attendanceMarkedRef = useRef<Set<string>>(new Set());
  const recognizedCooldownRef = useRef<Map<string, number>>(new Map());
  const stableHitsRef = useRef<Map<string, { hits: number; lastSeen: number }>>(new Map());
  const periodMarkedRef = useRef<Set<string>>(new Set());
  const borderlineRetryRef = useRef<Map<string, number>>(new Map());
  const [qualityBlockedCount, setQualityBlockedCount] = useState(0);
  const [autoMarkedCount, setAutoMarkedCount] = useState(0);
  const [avgLatencyMs, setAvgLatencyMs] = useState(0);
  const perfWindowRef = useRef<number[]>([]);
  const [autoZone, setAutoZone] = useState<DetectionBox | null>(null);
  // Store per-face labels for canvas overlay
  const faceLabelsRef = useRef<Map<string, { name: string; confidence: number; recognized: boolean }>>(new Map());
  const { isEnhancing: isAIEnhancing, autoEnhance } = usePhotoEnhancer();

  const syncPendingCount = useCallback(() => {
    if (!onPendingCountChange) return;
    const pending = Array.from(borderlineRetryRef.current.values()).filter((count) => count === 1).length;
    onPendingCountChange(pending);
  }, [onPendingCountChange]);

  const getCurrentPeriodKey = useCallback(() => {
    if (periodKey) return periodKey;
    return `period-${new Date().toISOString().slice(0, 10)}-default`;
  }, [periodKey]);

  // Load saved detection box for the active gate (uses first active gate row)
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from('school_gates')
          .select('id, detection_box')
          .eq('is_active', true)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (data) {
          setGateId(data.id);
          const box = (data as any).detection_box;
          if (box && typeof box === 'object' && 'x' in box) setDetectionBox(box as DetectionBox);
        }
      } catch (e) {
        console.warn('Could not load detection box', e);
      }
    })();
  }, []);

  useEffect(() => {
    if (!videoRef.current) return;
    const computeAutoZone = () => {
      const w = videoRef.current?.videoWidth || 1280;
      const h = videoRef.current?.videoHeight || 720;
      const isPortraitish = h > w;
      setAutoZone(
        isPortraitish
          ? { x: 0.23, y: 0.18, w: 0.54, h: 0.62 }
          : { x: 0.31, y: 0.14, w: 0.38, h: 0.68 }
      );
    };
    computeAutoZone();
    window.addEventListener('resize', computeAutoZone);
    return () => window.removeEventListener('resize', computeAutoZone);
  }, [isLoading, facingMode]);

  useEffect(() => {
    const activePeriod = getCurrentPeriodKey();
    (async () => {
      try {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);

        const { data } = await supabase
          .from('attendance_records')
          .select('user_id, metadata')
          .eq('source', 'gate-mode')
          .in('status', ['present', 'late'])
          .gte('timestamp', start.toISOString())
          .lt('timestamp', end.toISOString());

        if (data?.length) {
          const mapped = new Set<string>();
          data.forEach((row: any) => {
            if (!row.user_id) return;
            const key = row?.metadata?.gate_period_key || activePeriod;
            mapped.add(`${row.user_id}:${key}`);
          });
          periodMarkedRef.current = mapped;
        }
      } catch (e) {
        console.warn('Could not preload period attendance marks', e);
      }
    })();
  }, [getCurrentPeriodKey]);

  // Clear stale live matches
  useEffect(() => {
    const cleanup = setInterval(() => {
      const now = Date.now();
      setLiveMatches(prev => prev.filter(m => now - m.timestamp < 5000));
    }, 1000);
    return () => clearInterval(cleanup);
  }, []);

  // Start camera
  useEffect(() => {
    if (!isActive) return;
    let mounted = true;

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: { ideal: facingMode },
            frameRate: { ideal: 30 }
          }
        }).catch(() =>
          navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 } }
          })
        );

        if (!mounted) { stream.getTracks().forEach(t => t.stop()); return; }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        if (!areModelsLoaded()) await loadModels();
        if (mounted) setIsLoading(false);
      } catch (err) {
        if (mounted) {
          setCameraError('Camera access denied. Please allow camera permissions.');
          setIsLoading(false);
        }
      }
    };

    startCamera();

    return () => {
      mounted = false;
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      }
    };
  }, [isActive, facingMode]);

  // Continuous detection loop
  const detectLoop = useCallback(async () => {
    const startedAt = performance.now();
    if (processingRef.current || !videoRef.current || videoRef.current.paused) return;
    processingRef.current = true;

    try {
      const detections = await faceapi
        .detectAllFaces(videoRef.current, new faceapi.SsdMobilenetv1Options({
          minConfidence: 0.55
        }))
        .withFaceLandmarks()
        .withFaceDescriptors();

      setFacesInFrame(detections.length);

      // ─── DETECTION-ZONE GATING ───
      // If admin has set a detection box, ignore faces whose center falls outside it.
      const activeZone = detectionBox || autoZone;
      const filteredDetections = activeZone && videoRef.current
        ? detections.filter((d) => {
            const vw = videoRef.current!.videoWidth || 1;
            const vh = videoRef.current!.videoHeight || 1;
            const cx = (d.detection.box.x + d.detection.box.width / 2) / vw;
            const cy = (d.detection.box.y + d.detection.box.height / 2) / vh;
            return (
              cx >= activeZone.x &&
              cx <= activeZone.x + activeZone.w &&
              cy >= activeZone.y &&
              cy <= activeZone.y + activeZone.h
            );
          })
        : detections;

      // FPS counter
      fpsCounterRef.current.frames++;
      const now = Date.now();
      if (now - fpsCounterRef.current.lastTime >= 1000) {
        setFps(fpsCounterRef.current.frames);
        fpsCounterRef.current = { frames: 0, lastTime: now };
      }

      // Draw overlays with confidence
      if (canvasRef.current && videoRef.current) {
        const dims = faceapi.matchDimensions(canvasRef.current, videoRef.current, true);
        const resized = faceapi.resizeResults(detections, dims);
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

          // Draw the detection zone (if set) — always visible during gate mode.
          // Dim everything outside the zone and outline it with an animated glow.
          if (activeZone) {
            const cw = canvasRef.current.width;
            const ch = canvasRef.current.height;
            const bx = activeZone.x * cw;
            const by = activeZone.y * ch;
            const bw = activeZone.w * cw;
            const bh = activeZone.h * ch;
            ctx.save();
            // 1. Dim the area outside the zone using even-odd fill
            ctx.fillStyle = 'rgba(0,0,0,0.45)';
            ctx.beginPath();
            ctx.rect(0, 0, cw, ch);
            ctx.rect(bx, by, bw, bh);
            ctx.fill('evenodd');

            // 2. Animated dashed glow border
            const dashOffset = (now / 50) % 16;
            ctx.shadowColor = 'rgba(6,182,212,0.95)';
            ctx.shadowBlur = 18;
            ctx.strokeStyle = 'rgba(6,182,212,1)';
            ctx.lineWidth = 3;
            ctx.setLineDash([10, 6]);
            ctx.lineDashOffset = -dashOffset;
            ctx.strokeRect(bx, by, bw, bh);
            ctx.setLineDash([]);

            // 3. Corner brackets for an Apple-like target finder
            ctx.shadowBlur = 0;
            ctx.strokeStyle = 'rgba(6,182,212,1)';
            ctx.lineWidth = 4;
            const cornerLen = Math.min(28, bw / 6, bh / 6);
            const corners: [number, number, number, number][] = [
              [bx, by, bx + cornerLen, by], [bx, by, bx, by + cornerLen],
              [bx + bw, by, bx + bw - cornerLen, by], [bx + bw, by, bx + bw, by + cornerLen],
              [bx, by + bh, bx + cornerLen, by + bh], [bx, by + bh, bx, by + bh - cornerLen],
              [bx + bw, by + bh, bx + bw - cornerLen, by + bh], [bx + bw, by + bh, bx + bw, by + bh - cornerLen],
            ];
            corners.forEach(([x1, y1, x2, y2]) => {
              ctx.beginPath();
              ctx.moveTo(x1, y1);
              ctx.lineTo(x2, y2);
              ctx.stroke();
            });

            // 4. Label pill
            const labelText = detectionBox ? 'DETECTION ZONE' : 'SMART AUTO ZONE';
            ctx.font = 'bold 11px system-ui, sans-serif';
            const tw = ctx.measureText(labelText).width;
            ctx.fillStyle = 'rgba(6,182,212,0.95)';
            ctx.beginPath();
            ctx.roundRect(bx + 6, by + 6, tw + 14, 20, 6);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.fillText(labelText, bx + 13, by + 20);
            ctx.restore();
          }

          resized.forEach((d, idx) => {
            const box = d.detection.box;
            const descriptorKey = Array.from(detections[idx].descriptor.slice(0, 8)).map(v => v.toFixed(2)).join(',');
            const label = faceLabelsRef.current.get(descriptorKey);

            // Determine if this face is INSIDE the detection zone
            let insideZone = true;
            if (activeZone && videoRef.current) {
              const vw = videoRef.current.videoWidth || 1;
              const vh = videoRef.current.videoHeight || 1;
              const orig = detections[idx].detection.box;
              const cx = (orig.x + orig.width / 2) / vw;
              const cy = (orig.y + orig.height / 2) / vh;
              insideZone =
                cx >= activeZone.x &&
                cx <= activeZone.x + activeZone.w &&
                cy >= activeZone.y &&
                cy <= activeZone.y + activeZone.h;
            }

            // Color based on recognition status & zone membership
            const isRecognized = label?.recognized ?? false;
            let color = isRecognized ? '#22c55e' : '#ef4444';
            let colorAlpha = isRecognized ? '#22c55e80' : '#ef444480';
            if (!insideZone) {
              // Out-of-zone faces are visibly ignored (gray dashed)
              color = '#94a3b8';
              colorAlpha = '#94a3b880';
            }
            
            // Draw rounded box
            ctx.strokeStyle = color;
            ctx.lineWidth = 3;
            ctx.beginPath();
            const r = 8;
            ctx.moveTo(box.x + r, box.y);
            ctx.lineTo(box.x + box.width - r, box.y);
            ctx.arcTo(box.x + box.width, box.y, box.x + box.width, box.y + r, r);
            ctx.lineTo(box.x + box.width, box.y + box.height - r);
            ctx.arcTo(box.x + box.width, box.y + box.height, box.x + box.width - r, box.y + box.height, r);
            ctx.lineTo(box.x + r, box.y + box.height);
            ctx.arcTo(box.x, box.y + box.height, box.x, box.y + box.height - r, r);
            ctx.lineTo(box.x, box.y + r);
            ctx.arcTo(box.x, box.y, box.x + r, box.y, r);
            ctx.stroke();

            // Scanning animation line
            const scanY = box.y + (box.height * ((now % 2000) / 2000));
            ctx.strokeStyle = colorAlpha;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(box.x, scanY);
            ctx.lineTo(box.x + box.width, scanY);
            ctx.stroke();

            // Draw confidence label above the box
            if (!insideZone) {
              const ignoreText = 'Outside zone — ignored';
              ctx.font = 'bold 11px system-ui, sans-serif';
              const tw = ctx.measureText(ignoreText).width;
              ctx.fillStyle = 'rgba(100,116,139,0.9)';
              ctx.beginPath();
              ctx.roundRect(box.x - 4, box.y - 22, tw + 12, 18, 4);
              ctx.fill();
              ctx.fillStyle = '#ffffff';
              ctx.fillText(ignoreText, box.x + 2, box.y - 9);
            } else if (label) {
              const confPercent = Math.round(label.confidence * 100);
              const labelText = label.recognized 
                ? `${label.name} · ${confPercent}%` 
                : `Unknown · ${Math.round(d.detection.score * 100)}%`;
              
              ctx.font = 'bold 14px system-ui, sans-serif';
              const textWidth = ctx.measureText(labelText).width;
              const labelX = box.x;
              const labelY = box.y - 8;

              // Background pill
              ctx.fillStyle = isRecognized ? 'rgba(34,197,94,0.85)' : 'rgba(239,68,68,0.85)';
              const pillPad = 6;
              const pillH = 22;
              ctx.beginPath();
              ctx.roundRect(labelX - pillPad, labelY - pillH + 2, textWidth + pillPad * 2, pillH, 6);
              ctx.fill();

              // Text
              ctx.fillStyle = '#ffffff';
              ctx.fillText(labelText, labelX, labelY - 4);
            } else {
              // Show detection score even before recognition
              const scoreText = `Detecting... ${Math.round(d.detection.score * 100)}%`;
              ctx.font = '12px system-ui, sans-serif';
              const textWidth = ctx.measureText(scoreText).width;
              ctx.fillStyle = 'rgba(100,116,139,0.8)';
              ctx.beginPath();
              ctx.roundRect(box.x - 4, box.y - 24, textWidth + 8, 20, 4);
              ctx.fill();
              ctx.fillStyle = '#ffffff';
              ctx.fillText(scoreText, box.x, box.y - 10);
            }
          });
        }
      }

      // Process each detected face (only those inside the detection zone)
      for (const detection of filteredDetections) {
        const descriptorKey = Array.from(detection.descriptor.slice(0, 8)).map(v => v.toFixed(2)).join(',');
        const livenessDetectionScore = detection.detection.score ?? 0;
        const currentPeriodKey = getCurrentPeriodKey();

        // Cooldown: don't re-process same face within configured anti-spam window
        const lastSeen = cooldownRef.current.get(descriptorKey);
        if (lastSeen && now - lastSeen < REDETECTION_COOLDOWN_MS) continue;
        cooldownRef.current.set(descriptorKey, now);

        try {
          if (livenessDetectionScore < MIN_LIVENESS_DETECTION_SCORE) {
            setQualityBlockedCount((prev) => prev + 1);
            faceLabelsRef.current.set(descriptorKey, {
              name: 'Low quality / potential spoof',
              confidence: livenessDetectionScore,
              recognized: false,
            });
            continue;
          }

          const recognitionStartedAt = performance.now();
          const result = await recognizeFace(detection.descriptor);
          const recognitionLatency = performance.now() - recognitionStartedAt;
          perfWindowRef.current.push(recognitionLatency);
          if (perfWindowRef.current.length > 30) perfWindowRef.current.shift();
          const avg = perfWindowRef.current.reduce((sum, ms) => sum + ms, 0) / perfWindowRef.current.length;
          setAvgLatencyMs(Math.round(avg));

          const rawRecognized = result?.recognized || false;
          const rawConfidence = result?.confidence || detection.detection.score;
          const isRecognized = rawRecognized && rawConfidence >= MIN_RECOGNITION_CONFIDENCE;
          const studentName = isRecognized && result?.employee ? result.employee.name : 'Unknown Person';
          const studentId = isRecognized && result?.employee ? result.employee.id : null;
          const confidence = rawConfidence;

          // Silent skip for anti-spam cooldown window; period-level dedupe is handled separately.
          if (isRecognized && studentId) {
            const lastRecognizedAt = recognizedCooldownRef.current.get(studentId);
            if (
              attendanceMarkedRef.current.has(studentId) ||
              (lastRecognizedAt && now - lastRecognizedAt < DUPLICATE_COOLDOWN_MS)
            ) {
              continue;
            }
            recognizedCooldownRef.current.set(studentId, now);

            saveEmotionEvent({
              userId: studentId,
              studentId: result?.employee?.employee_id || studentId,
              source: 'gate-mode',
              descriptor: detection.descriptor,
              recognitionConfidence: confidence,
              metadata: {
                student_name: result?.employee?.name || studentName,
                gate_mode: true,
                gate_period_key: getCurrentPeriodKey(),
                capture_zone: detectionBox ? 'manual' : 'smart-auto',
              },
            }).then();
          }

          // Store label for canvas overlay
          faceLabelsRef.current.set(descriptorKey, {
            name: studentName,
            confidence,
            recognized: isRecognized
          });

          // Update live confidence HUD
          setLiveMatches(prev => {
            const filtered = prev.filter(m => m.name !== studentName || now - m.timestamp > 3000);
            return [...filtered, { name: studentName, confidence, recognized: isRecognized, timestamp: now }].slice(-5);
          });

            const nowTime = new Date();
            const isLateNow = nowTime.getHours() > cutoffHour || (nowTime.getHours() === cutoffHour && nowTime.getMinutes() >= cutoffMinute);

            let isStableIdentity = false;
            if (isRecognized && studentId) {
              const stableKey = `${studentId}:${currentPeriodKey}`;
              const existingStable = stableHitsRef.current.get(stableKey);
              const nextHits = existingStable && now - existingStable.lastSeen <= STABILITY_WINDOW_MS
                ? existingStable.hits + 1
                : 1;
              stableHitsRef.current.set(stableKey, { hits: nextHits, lastSeen: now });
              isStableIdentity = nextHits >= STABILITY_REQUIRED_HITS;
            }

            const entry: GateEntry = {
            id: uuidv4(),
            studentName,
            studentId,
            time: nowTime,
            isRecognized,
            confidence,
            isLate: isLateNow,
          };

          // Auto-mark attendance for recognized students (once per session)
          // Require ≥50% confidence to avoid false positives.
            if (
            isRecognized &&
            studentId &&
            confidence >= MIN_ATTENDANCE_MARK_CONFIDENCE &&
            livenessDetectionScore >= MIN_LIVENESS_DETECTION_SCORE &&
            isStableIdentity &&
              !attendanceMarkedRef.current.has(studentId) &&
              !periodMarkedRef.current.has(`${studentId}:${currentPeriodKey}`)
          ) {
              borderlineRetryRef.current.delete(studentId);
              syncPendingCount();
            attendanceMarkedRef.current.add(studentId);
              periodMarkedRef.current.add(`${studentId}:${currentPeriodKey}`);
              setAutoMarkedCount((prev) => prev + 1);
            try {
              // Capture the video frame for the notification email
              let capturedImageDataUrl: string | undefined;
              if (videoRef.current) {
                const capCanvas = document.createElement('canvas');
                capCanvas.width = videoRef.current.videoWidth;
                capCanvas.height = videoRef.current.videoHeight;
                const capCtx = capCanvas.getContext('2d');
                capCtx?.drawImage(videoRef.current, 0, 0);
                capturedImageDataUrl = capCanvas.toDataURL('image/jpeg', 0.85);
                if (aiEnhancerEnabled) {
                  capturedImageDataUrl = await autoEnhance(capturedImageDataUrl, capCanvas);
                }
              }
               await recordAttendance(
                 studentId,
                 isLateNow ? 'late' : 'present',
                 confidence,
                  {
                    metadata: {
                      gate_period_key: currentPeriodKey,
                      class: className,
                      section,
                      subject,
                    },
                  },
                 capturedImageDataUrl,
                 'gate-mode'
               );
            } catch (err) {
              console.error('Failed to record attendance:', err);
            }
          }

            if (isRecognized && studentId && confidence < MIN_ATTENDANCE_MARK_CONFIDENCE && confidence >= BORDERLINE_RETRY_CONFIDENCE) {
              const retries = borderlineRetryRef.current.get(studentId) || 0;
              if (retries < 1) {
                borderlineRetryRef.current.set(studentId, retries + 1);
                syncPendingCount();
                continue;
              }
              borderlineRetryRef.current.delete(studentId);
              syncPendingCount();
            }

            if (isRecognized && studentId && confidence < BORDERLINE_RETRY_CONFIDENCE) {
              borderlineRetryRef.current.delete(studentId);
              syncPendingCount();
            }

          onFaceDetected(entry);
        } catch {
          syncPendingCount();
          onFaceDetected({
            id: uuidv4(),
            studentName: 'Unknown Person',
            studentId: null,
            time: new Date(),
            isRecognized: false,
            confidence: detection.detection.score,
          });
        }
      }
    } catch (err) {
      console.error('Detection error:', err);
    }

    processingRef.current = false;
    const elapsed = performance.now() - startedAt;
    if (elapsed > 450) detectionIntervalMsRef.current = 420;
    else if (elapsed > 260) detectionIntervalMsRef.current = 320;
    else detectionIntervalMsRef.current = 220;
  }, [autoZone, cutoffHour, cutoffMinute, detectionBox, getCurrentPeriodKey, onFaceDetected, syncPendingCount]);

  // Detection interval
  useEffect(() => {
    if (!isActive || isLoading) return;
    let stopped = false;

    const scheduleNext = () => {
      if (stopped) return;
      const delay = detectionIntervalMsRef.current;
      intervalRef.current = setTimeout(async () => {
        await detectLoop();
        scheduleNext();
      }, delay);
    };

    scheduleNext();
    return () => {
      stopped = true;
      if (intervalRef.current) clearTimeout(intervalRef.current);
    };
  }, [isActive, isLoading, detectLoop]);

  // Clean up old cooldowns & labels
  useEffect(() => {
    const cleanup = setInterval(() => {
      const now = Date.now();
      cooldownRef.current.forEach((time, key) => {
        if (now - time > 20000) {
          cooldownRef.current.delete(key);
          faceLabelsRef.current.delete(key);
        }
      });

      recognizedCooldownRef.current.forEach((time, key) => {
        if (now - time > 20000) {
          recognizedCooldownRef.current.delete(key);
        }
      });
    }, 30000);
    return () => clearInterval(cleanup);
  }, []);

  if (cameraError) {
    return (
      <div className="h-full flex items-center justify-center bg-muted">
        <div className="text-center p-8">
          <Eye className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-destructive font-medium">{cameraError}</p>
          <p className="text-sm text-muted-foreground mt-2">Gate mode requires camera access to scan faces</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full bg-black touch-manipulation">
      <video
        ref={videoRef}
        className="h-full w-full object-cover"
        muted
        playsInline
        // Lock transform/origin to prevent any perceived auto-zoom on detection
        style={{
          transform: facingMode === 'user' ? 'scaleX(-1)' : 'none',
          transformOrigin: 'center center',
          willChange: 'auto',
        }}
      />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur">
          <div className="text-center px-4">
            <Loader2 className="h-10 w-10 sm:h-12 sm:w-12 animate-spin text-primary mx-auto mb-3 sm:mb-4" />
            <p className="text-foreground font-medium text-sm sm:text-base">Loading face detection models...</p>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">This may take a few seconds</p>
          </div>
        </div>
      )}

      {/* Status bar */}
      {!isLoading && (
        <div className="absolute top-2 left-2 right-2 sm:top-3 sm:left-3 sm:right-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5 sm:gap-2 bg-card/80 backdrop-blur rounded-full px-2 sm:px-3 py-1 sm:py-1.5">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[10px] sm:text-xs font-medium text-foreground">Live</span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            {aiEnhancerEnabled && isAIEnhancing && (
              <div className="bg-accent/80 backdrop-blur rounded-full px-2 sm:px-3 py-1 sm:py-1.5 flex items-center gap-1">
                <Wand2 className="h-3 w-3 text-accent-foreground animate-pulse" />
                <span className="text-[10px] sm:text-xs font-medium text-accent-foreground">Enhancing</span>
              </div>
            )}
            {facesInFrame > 0 && (
              <div className="bg-primary/80 backdrop-blur rounded-full px-2 sm:px-3 py-1 sm:py-1.5 flex items-center gap-1">
                <Scan className="h-3 w-3 text-primary-foreground" />
                <span className="text-[10px] sm:text-xs font-bold text-primary-foreground">{facesInFrame}</span>
              </div>
            )}
            <div className="bg-card/80 backdrop-blur rounded-full px-2 sm:px-3 py-1 sm:py-1.5 flex items-center gap-1">
              <Zap className="h-3 w-3 text-yellow-500" />
              <span className="text-[10px] sm:text-xs font-medium text-foreground">{fps} FPS</span>
            </div>
            <div className="bg-card/80 backdrop-blur rounded-full px-2 sm:px-3 py-1 sm:py-1.5 flex items-center gap-1">
              <ShieldCheck className="h-3 w-3 text-emerald-500" />
              <span className="text-[10px] sm:text-xs font-medium text-foreground">{autoMarkedCount} auto</span>
            </div>
            <div className="bg-card/80 backdrop-blur rounded-full px-2 sm:px-3 py-1 sm:py-1.5 flex items-center gap-1">
              <ShieldAlert className="h-3 w-3 text-rose-500" />
              <span className="text-[10px] sm:text-xs font-medium text-foreground">{qualityBlockedCount} blocked</span>
            </div>
            <div className="bg-card/80 backdrop-blur rounded-full px-2 sm:px-3 py-1 sm:py-1.5 flex items-center gap-1">
              <Zap className="h-3 w-3 text-cyan-500" />
              <span className="text-[10px] sm:text-xs font-medium text-foreground">{avgLatencyMs}ms</span>
            </div>
          </div>

          {/* Camera flip button */}
          <button
            onClick={() => {
              if (videoRef.current?.srcObject) {
                (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
              }
              setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
              setIsLoading(true);
            }}
            className="bg-card/80 backdrop-blur rounded-full p-2 sm:p-2.5 hover:bg-card transition-colors"
            title={facingMode === 'user' ? 'Switch to back camera' : 'Switch to front camera'}
          >
            <SwitchCamera className="h-4 w-4 sm:h-5 sm:w-5 text-foreground" />
          </button>

          {/* Detection-zone editor button */}
          <button
            onClick={() => setEditingBox((v) => !v)}
            className={`backdrop-blur rounded-full p-2 sm:p-2.5 transition-colors ml-1 ${
              editingBox ? 'bg-cyan-500 text-white' : 'bg-card/80 hover:bg-card text-foreground'
            }`}
            title="Edit detection zone"
          >
            <Square className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>
        </div>
      )}

      {!isLoading && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10">
          <div className="bg-card/80 backdrop-blur rounded-full px-4 py-2 border border-primary/30">
            <p className="text-[11px] sm:text-xs font-semibold text-foreground">Place face inside highlighted smart zone</p>
          </div>
        </div>
      )}

      {/* Detection-zone editor overlay (drag to draw a rectangle) */}
      {editingBox && !isLoading && (
        <DetectionBoxEditor
          initial={detectionBox}
          onCancel={() => setEditingBox(false)}
          onSave={async (box) => {
            setDetectionBox(box);
            setEditingBox(false);
            try {
              if (gateId) {
                await supabase.from('school_gates').update({ detection_box: box as any }).eq('id', gateId);
              } else {
                const { data } = await supabase
                  .from('school_gates')
                  .insert({ name: 'Main Gate', gate_type: 'main', detection_box: box as any })
                  .select('id')
                  .single();
                if (data) setGateId(data.id);
              }
            } catch (e) {
              console.error('Failed to save detection box', e);
            }
          }}
          onClear={async () => {
            setDetectionBox(null);
            setEditingBox(false);
            if (gateId) {
              try { await supabase.from('school_gates').update({ detection_box: null as any }).eq('id', gateId); } catch {}
            }
          }}
        />
      )}

      {/* Live confidence HUD */}
      <AnimatePresence>
        {liveMatches.length > 0 && !isLoading && (
          <div className="absolute bottom-14 sm:bottom-4 left-2 right-2 sm:left-3 sm:right-auto sm:max-w-xs space-y-1.5 z-10">
            {liveMatches.slice(-3).map((match, i) => (
              <motion.div
                key={`${match.name}-${match.timestamp}`}
                initial={{ opacity: 0, x: -20, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -20, scale: 0.95 }}
                transition={{ duration: 0.25 }}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl backdrop-blur-xl border shadow-lg ${
                  match.recognized 
                    ? 'bg-emerald-500/20 border-emerald-500/40' 
                    : 'bg-rose-500/20 border-rose-500/40'
                }`}
              >
                {match.recognized 
                  ? <ShieldCheck className="h-4 w-4 text-emerald-400 flex-shrink-0" /> 
                  : <ShieldAlert className="h-4 w-4 text-rose-400 flex-shrink-0" />
                }
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white truncate">{match.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {/* Confidence bar */}
                    <div className="flex-1 h-1.5 bg-white/20 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.round(match.confidence * 100)}%` }}
                        className={`h-full rounded-full ${
                          match.recognized ? 'bg-emerald-400' : 'bg-rose-400'
                        }`}
                      />
                    </div>
                    <span className={`text-[10px] font-bold ${
                      match.recognized ? 'text-emerald-300' : 'text-rose-300'
                    }`}>
                      {Math.round(match.confidence * 100)}%
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default GateModeScanner;
