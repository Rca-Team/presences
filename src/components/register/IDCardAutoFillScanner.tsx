import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import { CreditCard, Camera, Upload, Loader2, Sparkles, X, CheckCircle2 } from 'lucide-react';

export interface IDCardExtractedFields {
  name?: string;
  employee_id?: string;
  roll_number?: string;
  department?: string;
  email?: string;
  phone?: string;
  parent_name?: string;
  parent_phone?: string;
  parent_email?: string;
  blood_group?: string;
  address?: string;
  transport_mode?: string;
}

interface Props {
  onExtracted: (fields: IDCardExtractedFields) => void;
}

/**
 * Portrait ID-card scanner that captures a card via camera or upload,
 * sends it to the AI extraction edge function, and returns parsed fields.
 */
const IDCardAutoFillScanner: React.FC<Props> = ({ onExtracted }) => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setShowCamera(false);
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 1920 } },
      });
      streamRef.current = stream;
      setShowCamera(true);
      // wait next tick so videoRef mounts
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 50);
    } catch (err) {
      console.error(err);
      toast({ title: 'Camera error', description: 'Could not access camera. Use upload instead.', variant: 'destructive' });
    }
  };

  const captureFromCamera = async () => {
    if (!videoRef.current) return;
    const v = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext('2d')!.drawImage(v, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    stopCamera();
    setPreview(dataUrl);
    await runExtraction(dataUrl, 'capture.jpg', 'image/jpeg');
  };

  const handleFile = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setPreview(dataUrl);
      await runExtraction(dataUrl, file.name, file.type);
    };
    reader.readAsDataURL(file);
  };

  const runExtraction = async (dataUrl: string, fileName: string, fileType: string) => {
    setIsProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke('extract-pdf-users', {
        body: { fileData: dataUrl, fileName, fileType },
      });
      if (error) throw error;
      const user = data?.users?.[0];
      if (!user) {
        toast({ title: 'No data found', description: 'Could not read this card. Try a clearer photo.', variant: 'destructive' });
        return;
      }
      onExtracted(user);
      toast({
        title: 'ID Card scanned ✨',
        description: `Auto-filled details for ${user.name || 'student'}.`,
      });
      setIsOpen(false);
      setPreview(null);
    } catch (err: any) {
      console.error(err);
      toast({ title: 'Scan failed', description: err.message || 'Try again.', variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-blue-200 dark:border-blue-900 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-950/40 dark:to-cyan-950/40 p-4"
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-500/15 flex items-center justify-center flex-shrink-0">
            <CreditCard className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="font-semibold text-sm">Scan ID card to auto-fill</h4>
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Snap a portrait photo of the student ID card and we'll fill in the form for you.
            </p>
            <Button
              type="button"
              size="sm"
              onClick={() => setIsOpen(true)}
              className="mt-3 bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600"
            >
              <Camera className="w-4 h-4 mr-1.5" /> Scan ID Card
            </Button>
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => {
              if (!isProcessing) {
                stopCamera();
                setIsOpen(false);
                setPreview(null);
              }
            }}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-background rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
            >
              <div className="flex items-center justify-between p-4 border-b">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-blue-500" />
                  <h3 className="font-semibold">Scan Student ID</h3>
                </div>
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={() => { stopCamera(); setIsOpen(false); setPreview(null); }}
                  className="p-1 rounded-md hover:bg-muted disabled:opacity-50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-4">
                {/* Portrait card frame */}
                <div className="mx-auto relative bg-slate-900 rounded-xl overflow-hidden" style={{ width: 240, height: 380 }}>
                  {preview ? (
                    <img src={preview} alt="ID preview" className="w-full h-full object-cover" />
                  ) : showCamera ? (
                    <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 gap-3">
                      <CreditCard className="w-12 h-12 opacity-40" />
                      <p className="text-xs px-4 text-center">Frame the ID card vertically inside this area</p>
                    </div>
                  )}
                  {/* corner guides */}
                  <div className="pointer-events-none absolute inset-0">
                    {['top-2 left-2 border-t-2 border-l-2', 'top-2 right-2 border-t-2 border-r-2', 'bottom-2 left-2 border-b-2 border-l-2', 'bottom-2 right-2 border-b-2 border-r-2'].map((c) => (
                      <span key={c} className={`absolute w-5 h-5 border-blue-400 ${c}`} />
                    ))}
                  </div>
                  {isProcessing && (
                    <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white gap-2">
                      <Loader2 className="w-6 h-6 animate-spin" />
                      <p className="text-xs">AI reading card…</p>
                    </div>
                  )}
                </div>

                {!preview && !isProcessing && (
                  <div className="grid grid-cols-2 gap-2">
                    {showCamera ? (
                      <Button type="button" onClick={captureFromCamera} className="col-span-2">
                        <CheckCircle2 className="w-4 h-4 mr-1.5" /> Capture
                      </Button>
                    ) : (
                      <Button type="button" variant="outline" onClick={startCamera}>
                        <Camera className="w-4 h-4 mr-1.5" /> Camera
                      </Button>
                    )}
                    <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                      <Upload className="w-4 h-4 mr-1.5" /> Upload
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleFile(f);
                        e.target.value = '';
                      }}
                    />
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default IDCardAutoFillScanner;