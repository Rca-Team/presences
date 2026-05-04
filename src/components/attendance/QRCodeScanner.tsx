import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Webcam from 'react-webcam';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { getAttendanceCutoffTime, isPastCutoffTime } from '@/services/attendance/AttendanceSettingsService';
import { recordAttendance } from '@/services/face-recognition/RecognitionService';
import {
  QrCode,
  Camera,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Zap,
  Scan,
  Shield,
  User,
  Clock
} from 'lucide-react';

interface QRCodeScannerProps {
  onScanComplete?: (result: { success: boolean; name?: string; userId?: string }) => void;
}

interface QRData {
  id: string;
  name: string;
  employee_id: string;
  category: string;
  timestamp: number;
}

const QRCodeScanner: React.FC<QRCodeScannerProps> = ({ onScanComplete }) => {
  const { toast } = useToast();
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{ success: boolean; name?: string } | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [lastScannedId, setLastScannedId] = useState<string | null>(null);

  // Simple QR code detection using canvas
  const detectQRCode = useCallback(async () => {
    if (!webcamRef.current || !canvasRef.current) return;

    const video = webcamRef.current.video;
    if (!video || video.readyState !== 4) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    try {
      // Use BarcodeDetector API if available (modern browsers)
      if ('BarcodeDetector' in window) {
        const barcodeDetector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
        const barcodes = await barcodeDetector.detect(canvas);
        
        if (barcodes.length > 0) {
          const qrData = barcodes[0].rawValue;
          await processQRCode(qrData);
        }
      }
    } catch (err) {
      // Silently fail for detection errors
    }
  }, []);

  const processQRCode = async (qrDataString: string) => {
    try {
      const qrData: QRData = JSON.parse(qrDataString);
      
      // Prevent duplicate scans within 5 seconds
      if (qrData.id === lastScannedId) return;
      
      setLastScannedId(qrData.id);
      setIsScanning(false);
      
      // Record attendance — use the admin-configured cutoff time
      const cutoff = await getAttendanceCutoffTime();
      const status = isPastCutoffTime(cutoff) ? 'late' : 'present';

      // Capture current scanner frame for organized cloud training storage
      let capturedImageDataUrl: string | undefined;
      if (canvasRef.current) {
        capturedImageDataUrl = canvasRef.current.toDataURL('image/jpeg', 0.85);
      }
      
      await recordAttendance(
        qrData.id,
        status,
        1,
        {
          type: 'qr_code',
          scanned_at: new Date().toISOString(),
          metadata: {
            name: qrData.name,
            employee_id: qrData.employee_id,
            category: qrData.category,
          },
        },
        capturedImageDataUrl,
        'qr-scan',
      );

      setScanResult({ success: true, name: qrData.name });
      
      toast({
        title: "✓ Attendance Recorded",
        description: `Welcome, ${qrData.name}! Status: ${status}`,
      });

      onScanComplete?.({ success: true, name: qrData.name, userId: qrData.id });

      // Reset after 3 seconds
      setTimeout(() => {
        setScanResult(null);
        setLastScannedId(null);
      }, 3000);

    } catch (err) {
      console.error('QR processing error:', err);
      setScanResult({ success: false });
      toast({
        title: "Invalid QR Code",
        description: "This QR code is not valid for attendance.",
        variant: "destructive"
      });
      
      setTimeout(() => {
        setScanResult(null);
      }, 2000);
    }
  };

  const startScanning = () => {
    setIsScanning(true);
    setScanResult(null);
    
    // Start continuous scanning
    scanIntervalRef.current = setInterval(detectQRCode, 200);
  };

  const stopScanning = () => {
    setIsScanning(false);
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
      }
    };
  }, []);

  return (
    <div className="relative w-full">
      <canvas ref={canvasRef} className="hidden" />
      
      {/* Scanner Container */}
      <div className="relative aspect-[3/4] sm:aspect-video rounded-2xl overflow-hidden bg-slate-950 shadow-2xl shadow-purple-500/20">
        {/* Tech Grid Background */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute inset-0" style={{
            backgroundImage: `
              linear-gradient(rgba(168,85,247,0.1) 1px, transparent 1px),
              linear-gradient(90deg, rgba(168,85,247,0.1) 1px, transparent 1px)
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
          videoConstraints={{
            facingMode,
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }}
        />

        {/* Scanning Overlay */}
        <AnimatePresence>
          {isScanning && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-10"
            >
              {/* QR Frame */}
              <div className="absolute inset-0 flex items-center justify-center">
                <motion.div
                  className="relative w-64 h-64 sm:w-80 sm:h-80"
                  animate={{ scale: [1, 1.02, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  {/* Corner Brackets */}
                  <div className="absolute top-0 left-0 w-12 h-12 border-t-4 border-l-4 border-purple-400 rounded-tl-xl" />
                  <div className="absolute top-0 right-0 w-12 h-12 border-t-4 border-r-4 border-purple-400 rounded-tr-xl" />
                  <div className="absolute bottom-0 left-0 w-12 h-12 border-b-4 border-l-4 border-purple-400 rounded-bl-xl" />
                  <div className="absolute bottom-0 right-0 w-12 h-12 border-b-4 border-r-4 border-purple-400 rounded-br-xl" />

                  {/* Scanning Line */}
                  <motion.div
                    className="absolute left-4 right-4 h-1 bg-gradient-to-r from-transparent via-purple-400 to-transparent"
                    animate={{ top: ['10%', '90%', '10%'] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  />

                  {/* Center QR Icon */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <motion.div
                      className="w-16 h-16 rounded-2xl bg-purple-500/20 flex items-center justify-center"
                      animate={{ scale: [1, 1.1, 1], opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    >
                      <QrCode className="w-8 h-8 text-purple-400" />
                    </motion.div>
                  </div>
                </motion.div>
              </div>

              {/* Status Text */}
              <motion.div
                className="absolute bottom-20 left-0 right-0 text-center"
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1, repeat: Infinity }}
              >
                <p className="text-lg font-bold text-purple-400">
                  ◎ SCANNING FOR QR CODE...
                </p>
                <p className="text-sm text-purple-300 mt-1">
                  Position the QR code within the frame
                </p>
              </motion.div>

              {/* Floating Particles */}
              {[...Array(8)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute w-1.5 h-1.5 bg-purple-400 rounded-full"
                  style={{
                    left: `${20 + Math.random() * 60}%`,
                    top: `${20 + Math.random() * 60}%`,
                  }}
                  animate={{
                    y: [0, -20, 0],
                    opacity: [0, 1, 0],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    delay: i * 0.2,
                  }}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Success/Error Overlay */}
        <AnimatePresence>
          {scanResult && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={`absolute inset-0 z-20 flex items-center justify-center ${
                scanResult.success ? 'bg-green-950/80' : 'bg-red-950/80'
              }`}
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', damping: 15 }}
                className="text-center"
              >
                {scanResult.success ? (
                  <>
                    <motion.div
                      className="w-24 h-24 mx-auto rounded-full bg-green-500/20 flex items-center justify-center mb-4"
                      animate={{ scale: [1, 1.1, 1] }}
                      transition={{ duration: 1, repeat: Infinity }}
                    >
                      <CheckCircle className="w-12 h-12 text-green-400" />
                    </motion.div>
                    <p className="text-2xl font-bold text-green-400">VERIFIED!</p>
                    <p className="text-lg text-green-300 mt-1">{scanResult.name}</p>
                  </>
                ) : (
                  <>
                    <motion.div
                      className="w-24 h-24 mx-auto rounded-full bg-red-500/20 flex items-center justify-center mb-4"
                      animate={{ scale: [1, 1.1, 1] }}
                      transition={{ duration: 1, repeat: Infinity }}
                    >
                      <AlertCircle className="w-12 h-12 text-red-400" />
                    </motion.div>
                    <p className="text-2xl font-bold text-red-400">INVALID QR</p>
                  </>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Status Bar */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900/80 backdrop-blur-sm border border-purple-500/30">
          <QrCode className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-medium text-purple-300">QR Scanner</span>
          <div className={`w-2 h-2 rounded-full ${isScanning ? 'bg-green-400 animate-pulse' : 'bg-slate-500'}`} />
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 mt-6 justify-center">
        <Button
          variant="outline"
          size="lg"
          onClick={() => setFacingMode(f => f === 'user' ? 'environment' : 'user')}
          className="border-purple-500/30 text-purple-600 hover:bg-purple-500/10"
        >
          <RefreshCw className="w-5 h-5 mr-2" />
          Flip Camera
        </Button>

        <Button
          size="lg"
          onClick={isScanning ? stopScanning : startScanning}
          className={`px-8 ${
            isScanning 
              ? 'bg-red-500 hover:bg-red-600' 
              : 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600'
          } text-white shadow-lg ${isScanning ? 'shadow-red-500/25' : 'shadow-purple-500/25'}`}
        >
          {isScanning ? (
            <>
              <Scan className="w-5 h-5 mr-2 animate-pulse" />
              Stop Scanning
            </>
          ) : (
            <>
              <QrCode className="w-5 h-5 mr-2" />
              Start QR Scan
            </>
          )}
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-3 mt-6">
        {[
          { icon: Zap, label: 'Instant', value: 'Scan', color: 'text-yellow-500' },
          { icon: Shield, label: 'Secure', value: 'Verified', color: 'text-green-500' },
          { icon: Clock, label: 'Auto', value: 'Record', color: 'text-blue-500' },
        ].map((stat, i) => (
          <div key={i} className="flex flex-col items-center p-3 rounded-xl bg-slate-900/50 border border-purple-500/20">
            <stat.icon className={`w-5 h-5 ${stat.color} mb-1`} />
            <span className="text-lg font-bold text-white">{stat.value}</span>
            <span className="text-xs text-muted-foreground">{stat.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default QRCodeScanner;