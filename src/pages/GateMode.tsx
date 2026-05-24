import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Shield, X, Settings, Volume2, VolumeX, Maximize, Minimize,
  Users, Clock, AlertTriangle, CheckCircle2, Wifi, WifiOff, Wand2,
  DoorOpen, Eye, ChevronUp, ChevronDown
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import GateModeScanner from '@/components/gate/GateModeScanner';
import GateEntryFeedback from '@/components/gate/GateEntryFeedback';
import GateStatsOverlay from '@/components/gate/GateStatsOverlay';
import StrangerAlert from '@/components/gate/StrangerAlert';
import LateEntryForm from '@/components/gate/LateEntryForm';
import GateModeSetup from '@/components/gate/GateModeSetup';
import { useNavigate, Link } from 'react-router-dom';
import { useIsMobile } from '@/hooks/use-mobile';
import Logo from '@/components/Logo';

export interface GateEntry {
  id: string;
  studentName: string;
  studentId: string | null;
  time: Date;
  isRecognized: boolean;
  confidence: number;
  photoUrl?: string;
  isLate?: boolean;
}

const GateMode = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [isSetup, setIsSetup] = useState(true);
  const [gateName, setGateName] = useState('Main Gate');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [entries, setEntries] = useState<GateEntry[]>([]);
  const [lastEntry, setLastEntry] = useState<GateEntry | null>(null);
  const [showStrangerAlert, setShowStrangerAlert] = useState(false);
  const [strangerPhoto, setStrangerPhoto] = useState<string | undefined>();
  const [showLateForm, setShowLateForm] = useState(false);
  const [lateStudent, setLateStudent] = useState<GateEntry | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [totalStudents, setTotalStudents] = useState(0);
  const [totalPresentToday, setTotalPresentToday] = useState(0);
  const [lateCount, setLateCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [mobileStatsOpen, setMobileStatsOpen] = useState(false);
  const [cutoffHour, setCutoffHour] = useState(9);
  const [cutoffMinute, setCutoffMinute] = useState(0);
  const [activePeriodKey, setActivePeriodKey] = useState<string>(() => `period-${new Date().toISOString().slice(0, 10)}-default`);
  const [aiEnhancerEnabled, setAiEnhancerEnabled] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const fetchGateStats = useCallback(async () => {
    try {
      const [totalRes, attendanceRes] = await Promise.all([
        supabase
          .from('face_descriptors')
          .select('user_id')
          .eq('is_active', true)
          .not('user_id', 'is', null),
        (() => {
          const start = new Date();
          start.setHours(0, 0, 0, 0);
          const end = new Date(start);
          end.setDate(end.getDate() + 1);

          return supabase
            .from('attendance_records')
            .select('user_id, status')
            .eq('source', 'gate-mode')
            .in('status', ['present', 'late'])
            .not('user_id', 'is', null)
            .gte('timestamp', start.toISOString())
            .lt('timestamp', end.toISOString());
        })(),
      ]);

      const uniqueStudents = new Set((totalRes.data || []).map((row) => row.user_id).filter(Boolean));
      const todayRows = attendanceRes.data || [];
      const presentUsers = new Set(todayRows.map((row) => row.user_id).filter(Boolean));
      const lateUsers = new Set(todayRows.filter((row) => row.status === 'late').map((row) => row.user_id).filter(Boolean));

      setTotalStudents(uniqueStudents.size);
      setTotalPresentToday(presentUsers.size);
      setLateCount(lateUsers.size);
    } catch (error) {
      console.error('Failed to fetch gate stats:', error);
    }
  }, []);

  // Track online/offline
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Fetch baseline settings and live stats
  useEffect(() => {
    const fetchCutoff = async () => {
      const { data } = await supabase
        .from('attendance_settings')
        .select('value')
        .eq('key', 'cutoff_time')
        .maybeSingle();
      if (data?.value) {
        const parts = data.value.split(':');
        setCutoffHour(parseInt(parts[0], 10) || 9);
        setCutoffMinute(parseInt(parts[1], 10) || 0);
      }
    };

    const fetchActivePeriod = async () => {
      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      const { data } = await supabase
        .from('period_timings')
        .select('period_name, start_time, end_time')
        .order('start_time', { ascending: true });

      const current = (data || []).find((period) => {
        const [sh, sm] = String(period.start_time || '00:00:00').split(':').map(Number);
        const [eh, em] = String(period.end_time || '23:59:59').split(':').map(Number);
        const start = sh * 60 + sm;
        const end = eh * 60 + em;
        return nowMinutes >= start && nowMinutes <= end;
      });

      if (current?.period_name) {
        setActivePeriodKey(`period-${now.toISOString().slice(0, 10)}-${current.period_name.replace(/\s+/g, '-').toLowerCase()}`);
      }
    };

    fetchGateStats();
    fetchCutoff();
    fetchActivePeriod();

    const interval = setInterval(fetchGateStats, 15000);
    return () => clearInterval(interval);
  }, [fetchGateStats]);

  // Wake Lock to prevent screen sleep
  useEffect(() => {
    let wakeLock: any = null;
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await (navigator as any).wakeLock.request('screen');
        }
      } catch {}
    };
    if (!isSetup) requestWakeLock();
    return () => { wakeLock?.release(); };
  }, [isSetup]);

  const toggleFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) {
      await containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      await document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  const playSound = useCallback((type: 'success' | 'warning' | 'alert') => {
    if (!soundEnabled) return;
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      const ctx = audioContextRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.value = 0.3;
      
      if (type === 'success') {
        osc.frequency.value = 880;
        osc.type = 'sine';
      } else if (type === 'warning') {
        osc.frequency.value = 440;
        osc.type = 'triangle';
      } else {
        osc.frequency.value = 330;
        osc.type = 'sawtooth';
      }
      
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch {}
  }, [soundEnabled]);

  const startSession = useCallback(async (selectedGate: string) => {
    setGateName(selectedGate);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('gate_sessions')
        .insert({
          gate_name: selectedGate,
          started_by: user?.id,
          device_info: { userAgent: navigator.userAgent, screen: `${screen.width}x${screen.height}` }
        })
        .select('id')
        .single();
      
      if (error) throw error;
      setSessionId(data.id);
      setIsSetup(false);
      toast.success(`Gate Mode started at ${selectedGate}`);
    } catch (err) {
      toast.error('Failed to start gate session');
    }
  }, []);

  const handleFaceDetected = useCallback((entry: GateEntry) => {
    setEntries(prev => [entry, ...prev]);
    setLastEntry(entry);

    if (entry.isRecognized) {
      playSound('success');
      // Check if late based on configured cutoff time
      const now = new Date();
      if (now.getHours() > cutoffHour || (now.getHours() === cutoffHour && now.getMinutes() >= cutoffMinute)) {
        entry.isLate = true;
        setLateStudent(entry);
        setShowLateForm(true);
      }
      // Record gate entry in DB
      supabase.from('gate_entries').insert({
        student_id: entry.studentId,
        gate_session_id: sessionId,
        is_recognized: true,
        confidence_score: entry.confidence,
        gate_name: gateName,
        student_name: entry.studentName
      }).then();
    } else {
      playSound('alert');
      setStrangerPhoto(entry.photoUrl);
      setShowStrangerAlert(true);
      // Record unknown entry
      supabase.from('gate_entries').insert({
        gate_session_id: sessionId,
        is_recognized: false,
        confidence_score: entry.confidence,
        gate_name: gateName,
        snapshot_url: entry.photoUrl,
        student_name: 'Unknown'
      }).then();
    }

    fetchGateStats();
  }, [sessionId, gateName, playSound, cutoffHour, cutoffMinute, fetchGateStats]);

  const endSession = useCallback(async () => {
    if (sessionId) {
      const recognized = entries.filter(e => e.isRecognized).length;
      const unknown = entries.filter(e => !e.isRecognized).length;
      await supabase.from('gate_sessions').update({
        ended_at: new Date().toISOString(),
        total_entries: recognized,
        unknown_entries: unknown
      }).eq('id', sessionId);
    }
    navigate('/admin');
  }, [sessionId, entries, navigate]);

  if (isSetup) {
    return <GateModeSetup onStart={startSession} onCancel={() => navigate('/admin')} />;
  }

  const recognizedCount = entries.filter(e => e.isRecognized).length;
  const unknownCount = entries.filter(e => !e.isRecognized).length;
  const uniqueStudents = new Set(entries.filter(e => e.studentId).map(e => e.studentId)).size;

  return (
    <div ref={containerRef} className="fixed inset-0 bg-background z-50 flex flex-col overflow-hidden">
      {/* Top bar - compact on mobile */}
      <div className="flex items-center justify-between px-2 sm:px-4 py-1.5 sm:py-2 bg-card/80 backdrop-blur border-b border-border safe-area-top">
        <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
          <Link to="/" className="flex-shrink-0">
            <Logo size="sm" />
          </Link>
          <span className="font-bold text-sm sm:text-lg text-foreground truncate">{gateName}</span>
          <Badge variant="outline" className="text-[10px] sm:text-xs flex-shrink-0 px-1.5 sm:px-2">
            {isOnline ? <Wifi className="h-3 w-3 mr-0.5 text-green-500" /> : <WifiOff className="h-3 w-3 mr-0.5 text-destructive" />}
            <span className="hidden sm:inline">{isOnline ? 'Online' : 'Offline'}</span>
          </Badge>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9" onClick={() => setSoundEnabled(!soundEnabled)}>
            {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </Button>
          <Button
            variant={aiEnhancerEnabled ? 'default' : 'ghost'}
            size="sm"
            className="h-8 sm:h-9 text-xs px-2 sm:px-3"
            onClick={() => setAiEnhancerEnabled((prev) => !prev)}
          >
            <Wand2 className="h-3.5 w-3.5 mr-1" />
            <span className="hidden sm:inline">AI Enhance {aiEnhancerEnabled ? 'On' : 'Off'}</span>
          </Button>
          {!isMobile && (
            <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9" onClick={toggleFullscreen}>
              {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </Button>
          )}
          <Button variant="destructive" size="sm" className="h-8 sm:h-9 text-xs sm:text-sm px-2 sm:px-3" onClick={endSession}>
            <X className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-0.5 sm:mr-1" />
            <span className="hidden sm:inline">End Session</span>
            <span className="sm:hidden">End</span>
          </Button>
        </div>
      </div>

      {/* Main content - vertical on mobile, horizontal on desktop */}
      <div className={`flex-1 flex relative ${isMobile ? 'flex-col' : 'flex-row'}`}>
        {isMobile && <div className="absolute top-2 left-2 right-2 z-20 grid grid-cols-2 sm:grid-cols-4 gap-2 pointer-events-none">
          {[
            { label: 'Total Students', value: totalStudents },
            { label: 'Present Today', value: totalPresentToday },
            { label: 'Late', value: lateCount },
            { label: 'Pending', value: pendingCount },
          ].map((stat) => (
            <div key={stat.label} className="bg-card/85 backdrop-blur border border-border rounded-xl px-3 py-2">
              <p className="text-[10px] sm:text-xs text-muted-foreground">{stat.label}</p>
              <p className="text-base sm:text-lg font-bold text-foreground tabular-nums">{stat.value}</p>
            </div>
          ))}
        </div>}

        {/* Camera feed */}
        <div className={isMobile ? 'flex-1 relative' : 'flex-[7] relative'}>
          <GateModeScanner
            onFaceDetected={handleFaceDetected}
            isActive={!isSetup}
            onPendingCountChange={setPendingCount}
            periodKey={activePeriodKey}
            aiEnhancerEnabled={aiEnhancerEnabled}
          />
          
          {/* Entry feedback overlay */}
          <AnimatePresence>
            {lastEntry && (
              <GateEntryFeedback 
                entry={lastEntry} 
                onDismiss={() => setLastEntry(null)} 
              />
            )}
          </AnimatePresence>

          {/* Mobile: floating mini stats */}
          {isMobile && !mobileStatsOpen && (
            <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="bg-card/90 backdrop-blur rounded-full px-3 py-1.5 flex items-center gap-1.5 shadow-lg">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                  <span className="text-xs font-bold text-foreground">{uniqueStudents}</span>
                </div>
                {unknownCount > 0 && (
                  <div className="bg-destructive/90 backdrop-blur rounded-full px-3 py-1.5 flex items-center gap-1.5 shadow-lg">
                    <AlertTriangle className="h-3.5 w-3.5 text-destructive-foreground" />
                    <span className="text-xs font-bold text-destructive-foreground">{unknownCount}</span>
                  </div>
                )}
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="h-8 rounded-full shadow-lg text-xs"
                onClick={() => setMobileStatsOpen(true)}
              >
                <ChevronUp className="h-3.5 w-3.5 mr-1" />
                Details
              </Button>
            </div>
          )}
        </div>

        {/* Stats sidebar - desktop only */}
        {!isMobile && (
          <div className="flex-[3] border-l border-border">
            <GateStatsOverlay
              totalEntries={recognizedCount}
              totalStudents={totalStudents}
              uniqueStudents={uniqueStudents}
                totalPresentToday={totalPresentToday}
                lateCount={lateCount}
                pendingCount={pendingCount}
              unknownCount={unknownCount}
              recentEntries={entries.slice(0, 20)}
            />
          </div>
        )}

        {/* Mobile stats bottom sheet */}
        <AnimatePresence>
          {isMobile && mobileStatsOpen && (
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'tween', duration: 0.3 }}
              className="absolute bottom-0 left-0 right-0 bg-card/95 backdrop-blur-xl rounded-t-2xl border-t border-border shadow-2xl z-20"
              style={{ maxHeight: '60vh' }}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <h3 className="font-semibold text-foreground text-sm">Gate Stats</h3>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMobileStatsOpen(false)}>
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </div>
              <div className="overflow-y-auto" style={{ maxHeight: 'calc(60vh - 48px)' }}>
                <GateStatsOverlay
                  totalEntries={recognizedCount}
                  totalStudents={totalStudents}
                  uniqueStudents={uniqueStudents}
                  totalPresentToday={totalPresentToday}
                  lateCount={lateCount}
                  pendingCount={pendingCount}
                  unknownCount={unknownCount}
                  recentEntries={entries.slice(0, 20)}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Stranger Alert */}
      <AnimatePresence>
        {showStrangerAlert && (
          <StrangerAlert 
            photoUrl={strangerPhoto}
            gateName={gateName}
            onDismiss={() => setShowStrangerAlert(false)}
          />
        )}
      </AnimatePresence>

      {/* Late Entry Form */}
      <AnimatePresence>
        {showLateForm && lateStudent && (
          <LateEntryForm
            student={lateStudent}
            onSubmit={async (reason, detail) => {
              await supabase.from('late_entries').insert({
                student_id: lateStudent.studentId,
                student_name: lateStudent.studentName,
                reason,
                reason_detail: detail,
              });
              setShowLateForm(false);
              setLateStudent(null);
              toast.success('Late entry recorded');
            }}
            onDismiss={() => { setShowLateForm(false); setLateStudent(null); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default GateMode;
