import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import type { GateEntry } from '@/pages/GateMode';

interface GateEntryFeedbackProps {
  entry: GateEntry;
  onDismiss: () => void;
}

const GateEntryFeedback = ({ entry, onDismiss }: GateEntryFeedbackProps) => {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const isRecognized = entry.isRecognized;
  const isLate = entry.isLate;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ type: 'tween', duration: 0.2 }}
      // No scale, no background tint — keep camera view 100% stable (user requested no auto-zoom feel)
      className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-end justify-center pointer-events-none z-20"
      style={{ transform: 'translateX(-50%)', transformOrigin: 'center' }}
    >
      <motion.div
        initial={{ y: 8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'tween', duration: 0.2 }}
        className={`bg-card/95 backdrop-blur-xl rounded-xl px-4 py-3 shadow-2xl text-center max-w-[85vw] sm:max-w-sm pointer-events-auto border ${
          isRecognized
            ? isLate ? 'border-yellow-500/40' : 'border-green-500/40'
            : 'border-destructive/40'
        }`}
      >
        <div className="flex items-center gap-3">
          {isRecognized ? (
            isLate ? (
              <Clock className="h-7 w-7 text-yellow-500 flex-shrink-0" />
            ) : (
              <CheckCircle2 className="h-7 w-7 text-green-500 flex-shrink-0" />
            )
          ) : (
            <AlertTriangle className="h-7 w-7 text-destructive flex-shrink-0" />
          )}
          <div className="text-left min-w-0">
            <p className="font-bold text-base truncate">
              {isRecognized ? entry.studentName : 'Unknown Person'}
            </p>
            <p className="text-xs text-muted-foreground">
              {isRecognized
                ? isLate ? 'Late entry' : 'Welcome!'
                : 'Not registered'}
              {' · '}
              {entry.time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              {isRecognized && ` · ${(entry.confidence * 100).toFixed(0)}%`}
            </p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default GateEntryFeedback;
