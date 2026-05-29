import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ArrowLeft,
  Award,
  Calendar,
  CheckCircle2,
  Clock,
  Flame,
  GraduationCap,
  Medal,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Trophy,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { eachDayOfInterval, format, isSameDay, isToday, isWeekend, startOfMonth, subDays } from 'date-fns';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import Logo from '@/components/Logo';

interface ChildInfo {
  id: string;
  name: string;
  employee_id: string;
  category: string;
  image_url: string;
}

interface AttendancePoint {
  status: string;
  timestamp: string;
}

interface BadgeItem {
  id: string;
  badge_name: string | null;
  badge_type: string | null;
  awarded_at: string;
}

interface LeaderboardItem {
  id: string;
  student_id: string | null;
  student_name: string | null;
  class: string | null;
  section: string | null;
  score: number | null;
  rank: number | null;
}

interface ParentSummary {
  workingDays: number;
  presentDays: number;
  lateDays: number;
  absentDays: number;
  attendanceRate: number;
  streak: number;
  todayStatus: string;
  todayCheckinTime: string | null;
  badgeCount: number;
  todayGateEntries: number;
}

const STORAGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/face-images/`;

export default function ParentPortalPage() {
  const { toast } = useToast();
  const [studentId, setStudentId] = useState('');
  const [phoneNo, setPhoneNo] = useState('');
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [child, setChild] = useState<ChildInfo | null>(null);
  const [attendance, setAttendance] = useState<AttendancePoint[]>([]);
  const [badges, setBadges] = useState<BadgeItem[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardItem[]>([]);
  const [studentLeaderboard, setStudentLeaderboard] = useState<LeaderboardItem | null>(null);
  const [summary, setSummary] = useState<ParentSummary | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [timeScope, setTimeScope] = useState<'today' | 'week' | 'month'>('week');
  const [timelineFilter, setTimelineFilter] = useState<'all' | 'present' | 'late' | 'absent'>('all');

  const getImgUrl = (url: string) => (url?.startsWith('data:') ? url : url ? `${STORAGE_URL}${url}` : '');

  const fetchPortalData = useCallback(async (showError = false) => {
    if (!studentId.trim() || !phoneNo.trim()) return false;
    const cleanPhone = phoneNo.trim().replace(/[^0-9+]/g, '').substring(0, 15);

    try {
      const { data, error } = await supabase.functions.invoke('parent-lookup', {
        body: { student_id: studentId.trim(), phone: cleanPhone },
      });

      if (error) throw error;
      if (!data?.found) return false;

      setChild(data.student);
      setAttendance(data.attendance || []);
      setBadges(data.badges || []);
      setLeaderboard(data.leaderboard || []);
      setStudentLeaderboard(data.student_leaderboard || null);
      setSummary(data.summary || null);
      return true;
    } catch (err) {
      console.error('Parent portal lookup error:', err);
      if (showError) {
        toast({ title: 'Error', description: 'Unable to load parent portal data right now.', variant: 'destructive' });
      }
      return false;
    }
  }, [studentId, phoneNo, toast]);

  const handleSearch = async () => {
    if (!studentId.trim() || !phoneNo.trim()) {
      toast({ title: 'Required', description: 'Enter both Student ID and phone number.', variant: 'destructive' });
      return;
    }

    const digits = phoneNo.replace(/[^0-9]/g, '');
    if (digits.length < 10) {
      toast({ title: 'Invalid phone', description: 'Please enter a valid phone number.', variant: 'destructive' });
      return;
    }

    setLoading(true);
    setSearched(true);
    const ok = await fetchPortalData(true);
    if (!ok) {
      setChild(null);
      setAttendance([]);
      setBadges([]);
      setLeaderboard([]);
      setStudentLeaderboard(null);
      setSummary(null);
      toast({ title: 'No match', description: 'No student found with this Student ID and phone.', variant: 'destructive' });
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!child) return;

    const refresh = () => fetchPortalData();
    const channel = supabase
      .channel(`parent-portal-live-${studentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_records' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gate_entries' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'student_badges' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'class_leaderboard' }, refresh)
      .subscribe((status) => setIsLive(status === 'SUBSCRIBED'));

    const interval = setInterval(refresh, 15000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      supabase.removeChannel(channel);
      setIsLive(false);
    };
  }, [child, fetchPortalData, studentId]);

  const monthRecords = useMemo(() => {
    const dateMap: Record<string, string> = {};
    attendance.forEach((r) => {
      const key = format(new Date(r.timestamp), 'yyyy-MM-dd');
      const s = (r.status || '').toLowerCase();
      const normalized = s === 'unauthorized' || s.includes('present') ? 'present' : s.includes('late') ? 'late' : s;
      if (!dateMap[key]) dateMap[key] = normalized;
      if (normalized === 'present' && dateMap[key] === 'late') dateMap[key] = 'present';
    });

    const start = startOfMonth(new Date());
    const end = new Date();
    return eachDayOfInterval({ start, end }).map((d) => {
      const key = format(d, 'yyyy-MM-dd');
      return { date: d, status: dateMap[key] || 'absent' };
    });
  }, [attendance]);

  const weeklyTrend = useMemo(() => {
    const recent = eachDayOfInterval({ start: subDays(new Date(), 9), end: new Date() })
      .filter((d) => !isWeekend(d))
      .slice(-7);

    return recent.map((d) => {
      const rec = monthRecords.find((m) => isSameDay(m.date, d));
      return {
        day: format(d, 'EEE'),
        pct: rec?.status === 'present' ? 100 : rec?.status === 'late' ? 75 : 0,
      };
    });
  }, [monthRecords]);

  const statusLabel = (summary?.todayStatus || 'absent').toLowerCase();
  const statusView = {
    present: { title: 'Present', chip: 'bg-primary/10 text-primary border-primary/30' },
    late: { title: 'Late', chip: 'bg-secondary text-secondary-foreground border-border' },
    absent: { title: 'Absent', chip: 'bg-destructive/15 text-destructive border-destructive/40' },
    weekend: { title: 'Weekend', chip: 'bg-muted text-muted-foreground border-border' },
  }[statusLabel as 'present' | 'late' | 'absent' | 'weekend'] || { title: 'Absent', chip: 'bg-destructive/15 text-destructive border-destructive/40' };

  const gamified = useMemo(() => {
    const present = summary?.presentDays ?? 0;
    const late = summary?.lateDays ?? 0;
    const absent = summary?.absentDays ?? 0;
    const badgeCount = summary?.badgeCount ?? 0;
    const streak = summary?.streak ?? 0;
    const xpTotal = Math.max(0, present * 12 + late * 7 + badgeCount * 20 + streak * 10 - absent * 4);
    const level = Math.max(1, Math.floor(xpTotal / 140) + 1);
    const xpInLevel = xpTotal % 140;
    const progress = Math.min(100, Math.round((xpInLevel / 140) * 100));

    return {
      xpTotal,
      level,
      xpInLevel,
      xpToNext: 140 - xpInLevel,
      progress,
    };
  }, [summary]);

  const timelineRows = useMemo(() => {
    const scoped =
      timeScope === 'today'
        ? attendance.filter((item) => isToday(new Date(item.timestamp)))
        : timeScope === 'week'
          ? attendance.slice(0, 12)
          : attendance.slice(0, 30);

    return timelineFilter === 'all'
      ? scoped
      : scoped.filter((item) => (item.status || '').toLowerCase().includes(timelineFilter));
  }, [attendance, timeScope, timelineFilter]);

  const statCards = [
    { label: 'Attendance Rate', value: `${summary?.attendanceRate ?? 0}%`, icon: TrendingUp, tone: 'border-primary/40 bg-primary/10 text-primary' },
    { label: 'Present', value: summary?.presentDays ?? 0, icon: UserCheck, tone: 'border-accent/40 bg-accent/20 text-foreground' },
    { label: 'Late', value: summary?.lateDays ?? 0, icon: Clock, tone: 'border-secondary/40 bg-secondary/60 text-secondary-foreground' },
    { label: 'Absent', value: summary?.absentDays ?? 0, icon: UserX, tone: 'border-destructive/40 bg-destructive/15 text-destructive' },
    { label: 'Gate Entries Today', value: summary?.todayGateEntries ?? 0, icon: CheckCircle2, tone: 'border-primary/30 bg-primary/5 text-primary' },
    { label: 'Badges', value: summary?.badgeCount ?? 0, icon: Award, tone: 'border-primary/30 bg-primary/5 text-primary' },
  ];

  return (
    <div className="min-h-screen bg-background bg-[linear-gradient(135deg,hsl(var(--background))_0%,hsl(var(--card))_45%,hsl(var(--accent))_100%)]">
      <header className="sticky top-0 z-40 border-b border-primary/20 bg-card/80 px-4 py-3 backdrop-blur-xl animate-fade-in">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between">
          <div className="flex items-center gap-2">
            <Link to="/">
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <Logo />
            <span className="text-sm font-bold text-foreground">Parent Portal</span>
          </div>
          {child && (
            <Badge variant="outline" className="gap-1 text-[11px]">
              <span className={`h-2 w-2 rounded-full ${isLive ? 'bg-primary' : 'bg-muted-foreground'}`} />
              {isLive ? 'Realtime' : 'Syncing'}
            </Badge>
          )}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-5 pb-20">
        {!child && (
          <Card className="border-primary/20 bg-gradient-to-b from-card to-muted/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Search className="h-5 w-5 text-primary" />
                Parent Access
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="studentId">Student ID</Label>
                  <Input id="studentId" placeholder="e.g. STU001" value={studentId} onChange={(e) => setStudentId(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="phone">Parent Phone</Label>
                  <Input id="phone" type="tel" placeholder="e.g. 9876543210" value={phoneNo} onChange={(e) => setPhoneNo(e.target.value)} className="mt-1" />
                </div>
              </div>
              <Button onClick={handleSearch} disabled={loading} className="w-full md:w-auto">
                {loading ? 'Loading details...' : 'Open Parent Dashboard'}
              </Button>
              {searched && !child && !loading && (
                <p className="text-sm text-destructive">No student found with these details.</p>
              )}
            </CardContent>
          </Card>
        )}

        {child && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button variant="outline" size="sm" onClick={() => fetchPortalData(true)}>
                <RefreshCw className="mr-2 h-4 w-4" /> Refresh
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setChild(null);
                  setSearched(false);
                }}
              >
                <ArrowLeft className="mr-2 h-4 w-4" /> Search Another Student
              </Button>
            </div>

            <Card className="border-primary/40 bg-gradient-to-r from-primary/15 via-card to-accent/40 shadow-[0_10px_35px_-16px_hsl(var(--primary)/0.9)] animate-enter">
              <CardContent className="p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-center">
                  <Avatar className="h-20 w-20 border-2 border-primary/30">
                    <AvatarImage src={getImgUrl(child.image_url)} />
                    <AvatarFallback className="text-2xl">{child.name.charAt(0)}</AvatarFallback>
                  </Avatar>

                  <div className="flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <Badge className="border-primary/40 bg-primary/15 text-primary">
                        <Sparkles className="mr-1 h-3.5 w-3.5" /> Parent Live View
                      </Badge>
                      <Badge className="border-primary/40 bg-primary/10 text-primary">
                        <Flame className="mr-1 h-3.5 w-3.5" /> Streak {summary?.streak ?? 0}
                      </Badge>
                    </div>
                    <h2 className="text-2xl font-black text-foreground">{child.name}</h2>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant="secondary" className="gap-1">
                        <GraduationCap className="h-3 w-3" /> Class {child.category}
                      </Badge>
                      <Badge variant="outline">ID: {child.employee_id}</Badge>
                      <Badge className={statusView.chip}>{statusView.title} Today</Badge>
                    </div>
                  </div>

                  <div className="text-left md:text-right">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Level</p>
                    <p className="text-3xl font-black text-primary">{gamified.level}</p>
                    <p className="text-xs font-semibold text-muted-foreground">{gamified.xpTotal} XP</p>
                  </div>
                </div>

                <div className="mt-4 rounded-lg border border-primary/30 bg-background/70 p-3">
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span className="font-semibold text-foreground">Level Progress</span>
                    <span className="text-muted-foreground">{gamified.xpToNext} XP to next level</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-700"
                      style={{ width: `${gamified.progress}%` }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {statCards.map((s) => (
                <Card key={s.label} className={`border-border/80 bg-card/90 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg ${s.tone} animate-fade-in`}>
                  <CardContent className="p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <s.icon className="h-4 w-4" />
                      <span className="text-[10px] text-muted-foreground">Live</span>
                    </div>
                    <p className="text-2xl font-black text-foreground">{s.value}</p>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
              <Card className="lg:col-span-3 animate-enter">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between gap-2 text-base">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-primary" />
                      Real Attendance Timeline
                    </div>
                    <div className="flex items-center gap-1 rounded-md border border-border bg-muted/40 p-1">
                      {(['today', 'week', 'month'] as const).map((scope) => (
                        <button
                          key={scope}
                          onClick={() => setTimeScope(scope)}
                          className={`rounded px-2 py-1 text-[10px] font-semibold uppercase transition-all ${timeScope === scope ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                          {scope}
                        </button>
                      ))}
                    </div>
                  </CardTitle>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(['all', 'present', 'late', 'absent'] as const).map((filter) => (
                      <button
                        key={filter}
                        onClick={() => setTimelineFilter(filter)}
                        className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold capitalize transition-all ${timelineFilter === filter ? filter === 'absent' ? 'border-destructive/50 bg-destructive/15 text-destructive' : 'border-primary/40 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}
                      >
                        {filter}
                      </button>
                    ))}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="max-h-80 space-y-2 overflow-auto pr-1">
                    {timelineRows.length === 0 ? (
                      <p className="py-4 text-center text-sm text-muted-foreground">No attendance records yet.</p>
                    ) : (
                      timelineRows.map((item, idx) => {
                        const itemStatus = (item.status || '').toLowerCase();
                        const isAbsent = itemStatus.includes('absent');
                        const isLate = itemStatus.includes('late');
                        const badgeClass = isAbsent
                          ? 'border-destructive/50 bg-destructive/15 text-destructive'
                          : isLate
                            ? 'border-secondary/40 bg-secondary/60 text-secondary-foreground'
                            : 'border-primary/40 bg-primary/10 text-primary';

                        return (
                        <div key={`${item.timestamp}-${idx}`} className={`flex items-center justify-between rounded-lg border px-3 py-2 transition-all ${isAbsent ? 'border-destructive/35 bg-destructive/10' : 'border-border/70 bg-muted/20'}`}>
                          <div>
                            <p className="text-sm font-semibold capitalize text-foreground">{item.status}</p>
                            <p className="text-xs text-muted-foreground">{format(new Date(item.timestamp), 'EEE, d MMM yyyy • h:mm a')}</p>
                          </div>
                          <Badge className={badgeClass}>{isAbsent ? 'Alert' : isLate ? 'Late Mark' : 'Verified'}</Badge>
                        </div>
                      )})
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="lg:col-span-2 animate-enter">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Trophy className="h-4 w-4 text-primary" />
                    Realtime Badges & Achievements
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {badges.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">No achievements yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {badges.slice(0, 8).map((b) => (
                        <div key={b.id} className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
                          <div className="flex items-center gap-2">
                            <Medal className="h-4 w-4 text-primary" />
                            <div>
                              <p className="text-sm font-semibold text-foreground">{b.badge_name || b.badge_type || 'Badge'}</p>
                              <p className="text-xs text-muted-foreground">{format(new Date(b.awarded_at), 'd MMM yyyy')}</p>
                            </div>
                          </div>
                          <Badge variant="secondary">Unlocked</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
              <Card className="lg:col-span-3 animate-enter">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    Weekly Attendance Trend
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={170}>
                    <LineChart data={weeklyTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                        formatter={(v: number) => [`${v}%`, 'Attendance']}
                      />
                      <Line type="monotone" dataKey="pct" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ fill: 'hsl(var(--primary))', r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="lg:col-span-2 animate-enter">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Users className="h-4 w-4 text-primary" />
                    Real Class Leaderboard
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {leaderboard.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">No leaderboard data yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {leaderboard.map((row, idx) => {
                        const isCurrent = studentLeaderboard?.id === row.id;
                        return (
                          <div
                            key={row.id || idx}
                             className={`flex items-center justify-between rounded-lg border px-3 py-2 transition-all ${isCurrent ? 'border-primary/40 bg-primary/10 shadow-[0_6px_20px_-12px_hsl(var(--primary)/0.9)]' : 'border-border/70 bg-muted/20 hover:border-primary/30'}`}
                          >
                            <div className="flex items-center gap-2">
                              <div className="w-6 text-center text-sm font-bold text-foreground">#{row.rank || idx + 1}</div>
                              <p className="text-sm font-semibold text-foreground">{row.student_name || 'Student'}</p>
                            </div>
                            <Badge variant={isCurrent ? 'default' : 'secondary'}>{row.score || 0} pts</Badge>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card className="animate-fade-in">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldAlert className="h-4 w-4 text-destructive" />
                  {format(new Date(), 'MMMM yyyy')} Attendance Grid
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-7 gap-1.5">
                  {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => (
                    <div key={d} className="text-center text-[10px] font-medium text-muted-foreground">{d}</div>
                  ))}

                  {(() => {
                    const monthStart = startOfMonth(new Date());
                    const firstDay = monthStart.getDay();
                    const offset = firstDay === 0 ? 6 : firstDay - 1;
                    const blanks = Array.from({ length: offset }, (_, i) => <div key={`blank-${i}`} />);

                    const dayBoxes = monthRecords.map((entry) => {
                      const weekend = isWeekend(entry.date);
                      const modeClass = weekend
                        ? 'bg-muted/30 text-muted-foreground'
                        : entry.status === 'present'
                          ? 'bg-primary text-primary-foreground'
                          : entry.status === 'late'
                            ? 'bg-secondary text-secondary-foreground'
                            : 'bg-destructive text-destructive-foreground';

                      return (
                        <div
                          key={entry.date.toISOString()}
                          className={`aspect-square rounded-md text-[10px] font-medium flex items-center justify-center ${modeClass} ${isToday(entry.date) ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : ''}`}
                        >
                          {entry.date.getDate()}
                        </div>
                      );
                    });

                    return [...blanks, ...dayBoxes];
                  })()}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
