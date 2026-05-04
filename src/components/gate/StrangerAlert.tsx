import React from 'react';
import { motion } from 'framer-motion';
import { ShieldAlert, X, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface StrangerAlertProps {
  photoUrl?: string;
  gateName: string;
  onDismiss: () => void;
}

const StrangerAlert = ({ photoUrl, gateName, onDismiss }: StrangerAlertProps) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-destructive/10 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.8, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.8, y: 20 }}
        transition={{ type: 'tween' }}
        className="bg-card border-2 border-destructive rounded-2xl p-6 max-w-sm w-full shadow-2xl"
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center">
              <ShieldAlert className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <h3 className="font-bold text-foreground">Stranger Detected!</h3>
              <p className="text-xs text-muted-foreground">{gateName} • {new Date().toLocaleTimeString('en-IN')}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onDismiss}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {photoUrl && (
          <div className="rounded-lg overflow-hidden mb-4 border border-border">
            <img src={photoUrl} alt="Unknown person" className="w-full h-48 object-cover" />
          </div>
        )}

        <p className="text-sm text-muted-foreground mb-4">
          An unregistered person was detected at the gate. Admin has been notified automatically.
        </p>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onDismiss}>
            Dismiss
          </Button>
          <Button variant="destructive" className="flex-1" onClick={() => {
            // TODO: Trigger emergency alert
            onDismiss();
          }}>
            <Bell className="h-4 w-4 mr-1" /> Alert Staff
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default StrangerAlert;
