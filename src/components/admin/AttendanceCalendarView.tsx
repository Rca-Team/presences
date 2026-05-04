import React from 'react';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface AttendanceRecord {
  name?: string;
  timestamp: string;
  status: string;
}

interface AttendanceCalendarViewProps {
  selectedDate: Date | undefined;
  setSelectedDate: (date: Date | undefined) => void;
  attendanceDays: Date[];
  lateAttendanceDays: Date[];
  absentDays: Date[];
  attendanceRecords?: Record<string, AttendanceRecord[]>;
}

const AttendanceCalendarView: React.FC<AttendanceCalendarViewProps> = ({
  selectedDate,
  setSelectedDate,
  attendanceDays,
  lateAttendanceDays,
  absentDays,
  attendanceRecords = {}
}) => {
  const today = new Date();
  const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  
  const getDateKey = (date: Date) => format(date, 'yyyy-MM-dd');
  
  const isSameDay = (a: Date, b: Date) =>
    a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();

  const renderDayContent = (day: Date) => {
    const dateKey = getDateKey(day);
    const records = attendanceRecords[dateKey] || [];
    
    const isPresentDay = attendanceDays.some(d => isSameDay(d, day));
    const isLateDay = lateAttendanceDays.some(d => isSameDay(d, day));
    const isAbsentDay = absentDays.some(d => isSameDay(d, day));
    const isToday = isSameDay(day, today);

    let dotColor = '';
    let tooltipContent = '';

    if (isPresentDay) {
      dotColor = 'bg-green-500';
      const rec = records.find(r => {
        const s = (r.status || '').toLowerCase();
        return s.includes('present') || s === 'unauthorized';
      });
      tooltipContent = rec ? `Present at ${format(new Date(rec.timestamp), 'h:mm a')}` : 'Present';
    } else if (isLateDay) {
      dotColor = 'bg-amber-500';
      const rec = records.find(r => (r.status || '').toLowerCase().includes('late'));
      tooltipContent = rec ? `Late at ${format(new Date(rec.timestamp), 'h:mm a')}` : 'Late';
    } else if (isAbsentDay) {
      dotColor = 'bg-red-400';
      tooltipContent = 'Absent';
    }
    
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="relative w-full h-full flex flex-col items-center justify-center gap-0.5">
              <span className={cn(
                "text-xs sm:text-sm tabular-nums",
                isToday && "font-bold"
              )}>
                {day.getDate()}
              </span>
              {dotColor && (
                <span className={cn("w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full", dotColor)} />
              )}
            </div>
          </TooltipTrigger>
          {tooltipContent && (
            <TooltipContent side="top" className="text-xs">
              {tooltipContent}
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>
    );
  };

  const presentCount = attendanceDays.length;
  const lateCount = lateAttendanceDays.length;
  const absentCount = absentDays.length;
  
  return (
    <Card className="overflow-hidden h-full">
      <CardContent className="p-0">
        {/* Compact legend */}
        <div className="flex items-center gap-3 sm:gap-4 px-3 sm:px-4 pt-3 sm:pt-4 pb-1.5 sm:pb-2">
          <LegendItem color="bg-green-500" label="Present" count={presentCount} />
          <LegendItem color="bg-amber-500" label="Late" count={lateCount} />
          <LegendItem color="bg-red-400" label="Absent" count={absentCount} />
        </div>

        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={setSelectedDate}
          className={cn("p-2 sm:p-3 pointer-events-auto w-full")}
          modifiersStyles={{
            present: { 
              backgroundColor: 'hsl(var(--accent))',
              fontWeight: 600,
            },
            late: { 
              backgroundColor: 'hsl(var(--accent))',
              fontWeight: 600,
            },
            absent: {
              backgroundColor: 'hsl(var(--accent))',
              fontWeight: 600,
            },
            today: {
              backgroundColor: 'hsl(var(--primary) / 0.1)',
              borderWidth: '2px',
              borderColor: 'hsl(var(--primary))',
            }
          }}
          components={{
            DayContent: ({ date }) => renderDayContent(date)
          }}
          modifiers={{
            present: attendanceDays || [],
            late: lateAttendanceDays || [],
            absent: absentDays || [],
            today: [today]
          }}
          defaultMonth={currentMonth}
          classNames={{
            day: "relative h-8 w-8 sm:h-10 sm:w-10 transition-all duration-150 hover:bg-accent rounded-lg cursor-pointer",
            head_cell: "text-muted-foreground text-[10px] sm:text-[11px] font-medium w-8 sm:w-10",
            cell: "text-center p-0.5",
            caption_label: "text-xs sm:text-sm font-semibold",
            nav_button: "h-7 w-7 sm:h-8 sm:w-8 bg-transparent hover:bg-accent rounded-lg",
            table: "w-full",
          }}
        />
      </CardContent>
    </Card>
  );
};

const LegendItem: React.FC<{ color: string; label: string; count: number }> = ({ color, label, count }) => (
  <div className="flex items-center gap-1 sm:gap-1.5">
    <span className={cn("w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full", color)} />
    <span className="text-[10px] sm:text-[11px] text-muted-foreground">{label}</span>
    <span className="text-[10px] sm:text-[11px] font-bold tabular-nums">{count}</span>
  </div>
);

export default AttendanceCalendarView;
