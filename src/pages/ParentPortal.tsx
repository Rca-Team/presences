import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  UserCheck, UserX, Clock, Calendar, TrendingUp,
  GraduationCap, CheckCircle2, AlertTriangle, XCircle, Search, ArrowLeft, RefreshCw
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import Logo from '@/components/Logo';
import { Link } from 'react-router-dom';
import { format, startOfMonth, eachDayOfInterval, isWeekend, subDays, isSameDay, isToday } from 'date-fns';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { useToast } from '@/hooks/use-toast';

interface ChildInfo {
  id: string;
  name: string;
  employee_id: string;
  category: string;
  image_url: string;
}

interface DayRecord {
  date: Date;
  status: 'present' | 'late' | 'absent';
  time?: string;
}

const STORAGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/face-images/`;

export default function ParentPortalPage() {
  const { toast } = useToast();
  const [studentId, setStudentId] = useState('');
  const [phoneNo, setPhoneNo] = useState('');
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [child, setChild] = useState<ChildInfo | null>(null);
  const [monthRecords, setMonthRecords] = useState<DayRecord[]>([]);
  const [trendData, setTrendData] = useState<{ day: string; pct: number }[]>([]);
  const [stats, setStats] = useState({ present: 0, late: 0, absent: 0, total: 0, rate: 0, streak: 0 });
  const [todayStatus, setTodayStatus] = useState<{ status: string; time?: string }>({ status: 'absent' });

  const refreshData = useCallback(async () => {
    if (!studentId.trim() || !phoneNo.trim()) return;
    const cleanPhone = phoneNo.trim().replace(/[^0-9+]/g, '').substring(0, 15);
    try {
      const { data } = await supabase.functions.invoke('parent-lookup', {
        body: { student_id: studentId.trim(), phone: cleanPhone },
      });
      if (data?.found) {
        setChild(data.student);
        processAttendance(data.attendance);
      }
    } catch (e) {
      console.error('Refresh error:', e);
    }
  }, [studentId, phoneNo]);

  // Realtime: auto-refresh when attendance changes
  useEffect(() => {
    if (!child) return;
    const channel = supabase
      .channel('parent-portal-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'attendance_records' }, () => {
        refreshData();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gate_entries' }, () => {
        refreshData();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [child, refreshData]);

  const handleSearch = async () => {
    if (!studentId.trim() || !phoneNo.trim()) {
      toast({ title: 'Required', description: 'Please enter both Student ID and Phone No.', variant: 'destructive' });
      return;
    }

    const cleanPhone = phoneNo.trim().replace(/[^0-9+]/g, '').substring(0, 15);
    if (cleanPhone.replace(/[^0-9]/g, '').length < 10) {
      toast({ title: 'Invalid Phone', description: 'Please enter a valid 10-digit phone number.', variant: 'destructive' });
      return;
    }

    setLoading(true);
    setSearched(true);
    setChild(null);

    try {
      const { data, error } = await supabase.functions.invoke('parent-lookup', {
        body: { student_id: studentId.trim(), phone: cleanPhone },
      });

      if (error) throw error;

      if (!data?.found) {
        toast({ title: 'Not Found', description: 'No student found with this ID and Phone combination.', variant: 'destructive' });
        setLoading(false);
        return;
      }

      setChild(data.student);
      processAttendance(data.attendance);
    } catch (e) {
      console.error('Search error:', e);
      toast({ title: 'Error', description: 'Something went wrong. Please try again.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const normalizeStatus = (s: string) => {
    const lower = (s || '').toLowerCase().trim();
    if (lower === 'unauthorized' || lower.includes('present')) return 'present';
    if (lower.includes('late')) return 'late';
    return lower;
  };

  const processAttendance = (attendance: { status: string; timestamp: string }[]) => {
    const today = new Date();
    const monthStart = startOfMonth(today);
    const workingDays = eachDayOfInterval({ start: monthStart, end: today }).filter(d => !isWeekend(d));

    const dateMap: Record<string, { status: string; time: string }> = {};
    attendance.forEach(r => {
      const ds = format(new Date(r.timestamp), 'yyyy-MM-dd');
      const status = normalizeStatus(r.status);
      if (!dateMap[ds]) {
        dateMap[ds] = { status, time: format(new Date(r.timestamp), 'h:mm a') };
      } else if (status === 'present' && dateMap[ds].status === 'late') {
        // Present overrides late
        dateMap[ds] = { status, time: format(new Date(r.timestamp), 'h:mm a') };
      }
    });

    const monthRecs: DayRecord[] = workingDays.map(d => {
      const ds = format(d, 'yyyy-MM-dd');
      const rec = dateMap[ds];
      return { date: d, status: rec ? (rec.status as 'present' | 'late') : 'absent', time: rec?.time };
    });
    setMonthRecords(monthRecs);

    const todayStr = format(today, 'yyyy-MM-dd');
    const todayRec = dateMap[todayStr];
    setTodayStatus(todayRec ? { status: todayRec.status, time: todayRec.time } : { status: isWeekend(today) ? 'weekend' : 'absent' });

    const present = monthRecs.filter(r => r.status === 'present').length;
    const late = monthRecs.filter(r => r.status === 'late').length;
    const absent = monthRecs.filter(r => r.status === 'absent').length;
    const total = workingDays.length;
    let streak = 0;
    for (let i = monthRecs.length - 1; i >= 0; i--) {
      if (monthRecs[i].status === 'present' || monthRecs[i].status === 'late') streak++;
      else break;
    }
    setStats({ present, late, absent, total, rate: total > 0 ? Math.round(((present + late) / total) * 100) : 0, streak });

    const last7 = eachDayOfInterval({ start: subDays(today, 9), end: today }).filter(d => !isWeekend(d)).slice(-7);
    setTrendData(last7.map(d => {
      const ds = format(d, 'yyyy-MM-dd');
      const rec = dateMap[ds];
      return { day: format(d, 'EEE'), pct: rec?.status === 'present' ? 100 : rec?.status === 'late' ? 75 : 0 };
    }));
  };

  const getImgUrl = (url: string) => url?.startsWith('data:') ? url : url ? `${STORAGE_URL}${url}` : '';

  const statusConfig: Record<string, { icon: React.ReactNode; label: string; color: string; bg: string }> = {
    present: { icon: <CheckCircle2 className="h-8 w-8" />, label: 'Present', color: 'text-green-500', bg: 'bg-green-500/10 border-green-500/30' },
    late: { icon: <AlertTriangle className="h-8 w-8" />, label: 'Late', color: 'text-yellow-500', bg: 'bg-yellow-500/10 border-yellow-500/30' },
    absent: { icon: <XCircle className="h-8 w-8" />, label: 'Absent', color: 'text-red-500', bg: 'bg-red-500/10 border-red-500/30' },
    weekend: { icon: <Calendar className="h-8 w-8" />, label: 'Weekend', color: 'text-muted-foreground', bg: 'bg-muted/50 border-border' },
  };

  const sc = statusConfig[todayStatus.status] || statusConfig.absent;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-card/80 backdrop-blur-xl border-b border-border px-4 py-3">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div className="flex items-center gap-2">
            <Link to="/">
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <Logo />
            <span className="font-bold text-foreground text-sm">Parent Portal</span>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto p-4 space-y-4 pb-20">
        {!child && (
          <Card className="border-primary/20">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Search className="h-5 w-5 text-primary" />
                Find Your Child's Attendance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Enter your child's Student ID and your registered phone number to view attendance.
              </p>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="studentId">Student ID</Label>
                  <Input
                    id="studentId"
                    placeholder="e.g. STU001"
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value)}
                    maxLength={50}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="phone">Parent Phone Number</Label>
                  <Input
                    id="phone"
                    placeholder="e.g. 9876543210"
                    value={phoneNo}
                    onChange={(e) => setPhoneNo(e.target.value)}
                    type="tel"
                    maxLength={15}
                    className="mt-1"
                  />
                </div>
                <Button onClick={handleSearch} disabled={loading} className="w-full">
                  {loading ? 'Searching...' : 'View Attendance'}
                </Button>
              </div>
              {searched && !child && !loading && (
                <p className="text-sm text-destructive text-center">No matching student found. Please check your details.</p>
              )}
            </CardContent>
          </Card>
        )}

        {child && (
          <>
            <Button variant="ghost" size="sm" onClick={() => { setChild(null); setSearched(false); }}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Search Another
            </Button>

            <Card className="border-primary/20">
              <CardContent className="p-4 flex items-center gap-4">
                <Avatar className="h-16 w-16 border-2 border-primary/30">
                  <AvatarImage src={getImgUrl(child.image_url)} />
                  <AvatarFallback className="text-xl">{child.name.charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <h2 className="font-bold text-lg text-foreground">{child.name}</h2>
                  <div className="flex gap-2 mt-1">
                    <Badge variant="secondary" className="text-xs">
                      <GraduationCap className="h-3 w-3 mr-1" /> Class {child.category}
                    </Badge>
                    <Badge variant="outline" className="text-xs">ID: {child.employee_id}</Badge>
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-black text-primary">{stats.rate}%</div>
                  <p className="text-[10px] text-muted-foreground">Attendance</p>
                </div>
              </CardContent>
            </Card>

            <Card className={`border ${sc.bg}`}>
              <CardContent className="p-5 flex items-center gap-4">
                <div className={sc.color}>{sc.icon}</div>
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Today's Status</p>
                  <p className={`text-xl font-bold ${sc.color}`}>{sc.label}</p>
                </div>
                {todayStatus.time && (
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Check-in</p>
                    <p className="font-semibold text-foreground">{todayStatus.time}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-4 gap-2">
              {[
                { label: 'Working', value: stats.total, icon: <Calendar className="h-4 w-4 text-blue-500" /> },
                { label: 'Present', value: stats.present, icon: <UserCheck className="h-4 w-4 text-green-500" /> },
                { label: 'Late', value: stats.late, icon: <Clock className="h-4 w-4 text-yellow-500" /> },
                { label: 'Absent', value: stats.absent, icon: <UserX className="h-4 w-4 text-red-500" /> },
              ].map(s => (
                <Card key={s.label}>
                  <CardContent className="p-3 text-center">
                    <div className="flex justify-center mb-1">{s.icon}</div>
                    <p className="text-xl font-bold text-foreground">{s.value}</p>
                    <p className="text-[10px] text-muted-foreground">{s.label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {stats.streak > 0 && (
              <div className="bg-primary/10 border border-primary/20 rounded-xl px-4 py-3 flex items-center gap-3">
                <span className="text-2xl">🔥</span>
                <div>
                  <p className="font-bold text-foreground">{stats.streak}-Day Streak!</p>
                  <p className="text-xs text-muted-foreground">Consecutive attendance days</p>
                </div>
              </div>
            )}

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  {format(new Date(), 'MMMM yyyy')}
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-4">
                <div className="grid grid-cols-7 gap-1.5">
                  {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                    <div key={i} className="text-[10px] text-center text-muted-foreground font-medium">{d}</div>
                  ))}
                  {(() => {
                    const ms = startOfMonth(new Date());
                    const firstDay = ms.getDay();
                    const offset = firstDay === 0 ? 6 : firstDay - 1;
                    const blanks = Array.from({ length: offset }, (_, i) => <div key={`b-${i}`} />);
                    const allDays = eachDayOfInterval({ start: ms, end: new Date() });
                    const dayEls = allDays.map(d => {
                      const rec = monthRecords.find(r => isSameDay(r.date, d));
                      const isWknd = isWeekend(d);
                      return (
                        <div
                          key={d.toISOString()}
                          className={`aspect-square rounded-md flex items-center justify-center text-[10px] font-medium ${
                            isWknd ? 'text-muted-foreground bg-muted/20' :
                            rec?.status === 'present' ? 'text-white bg-green-500' :
                            rec?.status === 'late' ? 'text-white bg-yellow-500' :
                            'text-white bg-red-500/80'
                          } ${isToday(d) ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : ''}`}
                        >
                          {d.getDate()}
                        </div>
                      );
                    });
                    return [...blanks, ...dayEls];
                  })()}
                </div>
                <div className="flex items-center gap-4 mt-3 justify-center">
                  {[
                    { color: 'bg-green-500', label: 'Present' },
                    { color: 'bg-yellow-500', label: 'Late' },
                    { color: 'bg-red-500/80', label: 'Absent' },
                  ].map(l => (
                    <div key={l.label} className="flex items-center gap-1">
                      <div className={`w-2.5 h-2.5 rounded-sm ${l.color}`} />
                      <span className="text-[10px] text-muted-foreground">{l.label}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Weekly Trend
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        fontSize: '12px'
                      }}
                      formatter={(v: number) => [`${v}%`, 'Attendance']}
                    />
                    <Line type="monotone" dataKey="pct" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ fill: 'hsl(var(--primary))', r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
