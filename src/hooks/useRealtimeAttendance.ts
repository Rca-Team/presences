import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { pushNotificationService } from '@/services/PushNotificationService';

interface AttendanceUpdate {
  id: string;
  user_id: string | null;
  status: string;
  timestamp: string;
  category: string | null;
  device_info: any;
}

interface UseRealtimeAttendanceOptions {
  categories?: string[];
  onNewAttendance?: (record: AttendanceUpdate) => void;
  showNotifications?: boolean;
  enablePushNotifications?: boolean;
}

export const useRealtimeAttendance = (options: UseRealtimeAttendanceOptions = {}) => {
  const { toast } = useToast();
  const [recentAttendance, setRecentAttendance] = useState<AttendanceUpdate[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (optionsRef.current.showNotifications && 'Notification' in window) {
      Notification.requestPermission();
    }

    if (optionsRef.current.enablePushNotifications) {
      pushNotificationService.registerServiceWorker().catch(console.error);
    }

    const channel = supabase
      .channel('attendance-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'attendance_records',
        },
        async (payload: any) => {
          const record = payload.new as AttendanceUpdate;
          const opts = optionsRef.current;

          if (opts.categories && opts.categories.length > 0) {
            if (!record.category || !opts.categories.includes(record.category)) {
              return;
            }
          }

          if (record.status === 'present' || record.status === 'late') {
            const studentName = record.device_info?.metadata?.name || 
                                record.device_info?.employee_id || 
                                'A student';

            setRecentAttendance(prev => [record, ...prev.slice(0, 19)]);
            opts.onNewAttendance?.(record);

            if (opts.showNotifications) {
              toast({
                title: record.status === 'present' ? '✓ Attendance Marked' : '⏰ Late Arrival',
                description: `${studentName} marked ${record.status} in Category ${record.category || 'Unknown'}`,
                duration: 5000,
              });
            }

            if (opts.enablePushNotifications) {
              try {
                await pushNotificationService.sendAttendanceNotification(
                  studentName,
                  record.status as 'present' | 'late' | 'absent',
                  record.category || 'Unknown',
                  new Date(record.timestamp)
                );
              } catch (error) {
                console.error('Failed to send push notification:', error);
              }
            }

            if (opts.showNotifications && 'Notification' in window && Notification.permission === 'granted') {
              new Notification(`Attendance: ${studentName}`, {
                body: `Marked ${record.status} in Category ${record.category}`,
                icon: '/favicon.ico',
                tag: record.id,
              });
            }
          }
        }
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
    // Only run once on mount - options accessed via ref
  }, [toast]);

  const clearRecentAttendance = useCallback(() => {
    setRecentAttendance([]);
  }, []);

  return {
    recentAttendance,
    isConnected,
    clearRecentAttendance,
  };
};
