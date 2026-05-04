import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Clock, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { GateEntry } from '@/pages/GateMode';

interface LateEntryFormProps {
  student: GateEntry;
  onSubmit: (reason: string, detail: string) => Promise<void>;
  onDismiss: () => void;
}

const LATE_REASONS = [
  { value: 'traffic', label: 'Traffic' },
  { value: 'medical', label: 'Medical' },
  { value: 'transport', label: 'Transport Issue' },
  { value: 'weather', label: 'Weather' },
  { value: 'personal', label: 'Personal' },
  { value: 'other', label: 'Other' },
];

const LateEntryForm = ({ student, onSubmit, onDismiss }: LateEntryFormProps) => {
  const [reason, setReason] = useState('');
  const [detail, setDetail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!reason) return;
    setSubmitting(true);
    try {
      await onSubmit(reason, detail);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
    >
      <div className="bg-card rounded-2xl w-full max-w-md p-6 space-y-4 border border-border shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center">
              <Clock className="w-5 h-5 text-orange-500" />
            </div>
            <div>
              <h3 className="font-semibold">Late Entry</h3>
              <p className="text-sm text-muted-foreground">{student.studentName}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onDismiss}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="space-y-3">
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger>
              <SelectValue placeholder="Select reason for being late" />
            </SelectTrigger>
            <SelectContent>
              {LATE_REASONS.map(r => (
                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Textarea
            placeholder="Additional details (optional)"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            rows={3}
          />
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onDismiss}>Skip</Button>
          <Button className="flex-1" onClick={handleSubmit} disabled={!reason || submitting}>
            {submitting ? 'Saving...' : 'Submit'}
          </Button>
        </div>
      </div>
    </motion.div>
  );
};

export default LateEntryForm;
