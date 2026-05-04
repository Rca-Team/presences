import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  GraduationCap, Plus, Trash2, Clock, BookOpen, Save, Loader2, CalendarClock,
  UserCheck, AlertTriangle, ChevronLeft, RefreshCw, Printer,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getCategoryLabel, ALL_CLASS_SECTIONS } from '@/constants/schoolConfig';
import { format } from 'date-fns';

interface TeacherOption {
  id: string;
  user_id?: string;
  name: string;
  employee_id: string;
}

interface Subject {
  id: string;
  name: string;
  short_name: string | null;
}

interface ClassTeacher {
  id: string;
  category: string;
  teacher_record_id: string;
  teacher_name: string;
  role: string;
  subject_id: string | null;
}

interface PeriodTiming {
  id: string;
  period_number: number;
  start_time: string;
  end_time: string;
  is_break: boolean;
  label: string | null;
}

interface TimetableEntry {
  id?: string;
  category: string;
  day_of_week: number;
  period_number: number;
  subject_id: string | null;
  teacher_record_id: string;
  teacher_name: string;
}

interface Substitution {
  id: string;
  date: string;
  category: string;
  period_number: number;
  absent_teacher_name: string;
  substitute_teacher_name: string;
  status: string;
  auto_assigned: boolean;
}

const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface Props {
  category: string;
  onBack: () => void;
}

const ClassTeacherManager: React.FC<Props> = ({ category, onBack }) => {
  const { toast } = useToast();
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classTeachers, setClassTeachers] = useState<ClassTeacher[]>([]);
  const [periodTimings, setPeriodTimings] = useState<PeriodTiming[]>([]);
  const [timetable, setTimetable] = useState<TimetableEntry[]>([]);
  const [substitutions, setSubstitutions] = useState<Substitution[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newSubjectShort, setNewSubjectShort] = useState('');
  const [addSubjectOpen, setAddSubjectOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState(1);

  useEffect(() => { loadAll(); }, [category]);

  const loadAll = async () => {
    setIsLoading(true);
    try {
      const [teacherRes, subjectRes, ctRes, ptRes, ttRes, subRes] = await Promise.all([
        supabase.from('attendance_records').select('id, user_id, device_info').eq('status', 'registered').eq('category', 'Teacher'),
        supabase.from('subjects').select('*').order('name'),
        supabase.from('class_teachers').select('*').eq('category', category),
        supabase.from('period_timings').select('*').order('period_number'),
        supabase.from('timetable').select('*').eq('category', category),
        supabase.from('substitutions').select('*').eq('category', category).eq('date', format(new Date(), 'yyyy-MM-dd')),
      ]);

      if (teacherRes.data) {
        const t: TeacherOption[] = teacherRes.data.map(r => {
          const di = r.device_info as any;
          return {
            id: r.user_id || r.id,
            user_id: r.user_id || undefined,
            name: di?.metadata?.name || 'Unknown',
            employee_id: di?.metadata?.employee_id || 'N/A',
          };
        }).filter(t => t.name !== 'Unknown');
        setTeachers(t);
      }
      if (subjectRes.data) setSubjects(subjectRes.data as Subject[]);
      if (ctRes.data) setClassTeachers(ctRes.data as ClassTeacher[]);
      if (ptRes.data) setPeriodTimings(ptRes.data as PeriodTiming[]);
      if (ttRes.data) setTimetable(ttRes.data as TimetableEntry[]);
      if (subRes.data) setSubstitutions(subRes.data as Substitution[]);
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'Failed to load data', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const teachingPeriods = useMemo(() =>
    periodTimings.filter(p => !p.is_break), [periodTimings]
  );

  // --- Subjects ---
  const addSubject = async () => {
    if (!newSubjectName.trim()) return;
    const { error } = await supabase.from('subjects').insert({
      name: newSubjectName.trim(),
      short_name: newSubjectShort.trim() || null,
    });
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    setNewSubjectName('');
    setNewSubjectShort('');
    setAddSubjectOpen(false);
    loadAll();
    toast({ title: 'Subject Added' });
  };

  // --- Class/Subject Teacher ---
  const assignTeacher = async (role: string, teacherId: string, subjectId?: string) => {
    const teacher = teachers.find(t => t.id === teacherId);
    if (!teacher) return;

    // Remove existing assignment for this role+subject
    if (role === 'class_teacher') {
      await supabase.from('class_teachers').delete().eq('category', category).eq('role', 'class_teacher');
    }

    const { error } = await supabase.from('class_teachers').insert({
      category,
      teacher_record_id: teacher.id,
      teacher_name: teacher.name,
      role,
      subject_id: subjectId || null,
    });
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    loadAll();
    toast({ title: `${role === 'class_teacher' ? 'Class' : 'Subject'} Teacher Assigned` });
  };

  const removeTeacher = async (id: string) => {
    await supabase.from('class_teachers').delete().eq('id', id);
    loadAll();
  };

  // --- Timetable ---
  const setTimetableEntry = async (dayOfWeek: number, periodNumber: number, teacherId: string, subjectId: string | null) => {
    const teacher = teachers.find(t => t.id === teacherId);
    if (!teacher) return;

    const { error } = await supabase.from('timetable').upsert({
      category,
      day_of_week: dayOfWeek,
      period_number: periodNumber,
      teacher_record_id: teacher.id,
      teacher_name: teacher.name,
      subject_id: subjectId,
    }, { onConflict: 'category,day_of_week,period_number' });

    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    loadAll();
  };

  const removeTimetableEntry = async (dayOfWeek: number, periodNumber: number) => {
    await supabase.from('timetable').delete()
      .eq('category', category)
      .eq('day_of_week', dayOfWeek)
      .eq('period_number', periodNumber);
    loadAll();
  };

  // --- Auto Substitution ---
  const findSubstitutes = async () => {
    setIsSaving(true);
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      const dayOfWeek = new Date().getDay(); // 0=Sun, 1=Mon...
      if (dayOfWeek === 0) { toast({ title: 'Sunday', description: 'No classes today.' }); setIsSaving(false); return; }

      // Get today's timetable for this class
      const todayTimetable = timetable.filter(t => t.day_of_week === dayOfWeek);
      if (todayTimetable.length === 0) { toast({ title: 'No timetable', description: 'No timetable set for today.' }); setIsSaving(false); return; }

      // Check which teachers are absent today (no attendance record)
      const { data: attendanceToday } = await supabase
        .from('attendance_records')
        .select('user_id, device_info')
        .eq('category', 'Teacher')
        .in('status', ['present', 'late'])
        .gte('timestamp', `${today}T00:00:00`)
        .lte('timestamp', `${today}T23:59:59`);

      const presentTeacherIds = new Set<string>();
      (attendanceToday || []).forEach(r => {
        const empId = (r.device_info as any)?.metadata?.employee_id;
        const userId = r.user_id;
        if (userId) presentTeacherIds.add(userId);
        if (empId) presentTeacherIds.add(empId);
      });

      // Get ALL timetable entries for today (all classes) to know who's busy
      const { data: allTimetableToday } = await supabase
        .from('timetable')
        .select('*')
        .eq('day_of_week', dayOfWeek);

      // Get existing substitutions for today
      const { data: existingSubs } = await supabase
        .from('substitutions')
        .select('*')
        .eq('date', today);

      const busyByPeriod = new Map<number, Set<string>>();
      (allTimetableToday || []).forEach((entry: any) => {
        if (!busyByPeriod.has(entry.period_number)) busyByPeriod.set(entry.period_number, new Set());
        busyByPeriod.get(entry.period_number)!.add(entry.teacher_record_id);
      });
      // Also mark substitutes as busy
      (existingSubs || []).forEach((sub: any) => {
        if (!busyByPeriod.has(sub.period_number)) busyByPeriod.set(sub.period_number, new Set());
        busyByPeriod.get(sub.period_number)!.add(sub.substitute_teacher_id);
      });

      let assignedCount = 0;
      for (const entry of todayTimetable) {
        const isPresent = presentTeacherIds.has(entry.teacher_record_id);
        if (isPresent) continue;

        // Check if substitution already exists
        const alreadyAssigned = (existingSubs || []).some((s: any) =>
          s.category === category && s.period_number === entry.period_number
        );
        if (alreadyAssigned) continue;

        // Find a free teacher for this period
        const busyThisPeriod = busyByPeriod.get(entry.period_number) || new Set();
        const freeTeacher = teachers.find(t =>
          presentTeacherIds.has(t.id) && !busyThisPeriod.has(t.id) && t.id !== entry.teacher_record_id
        );

        if (freeTeacher) {
          await supabase.from('substitutions').insert({
            date: today,
            category,
            period_number: entry.period_number,
            absent_teacher_id: entry.teacher_record_id,
            absent_teacher_name: entry.teacher_name,
            substitute_teacher_id: freeTeacher.id,
            substitute_teacher_name: freeTeacher.name,
            subject_id: entry.subject_id,
            auto_assigned: true,
            status: 'assigned',
          });

          // Send in-app notification to substitute teacher
          const periodInfo = periodTimings.find(p => p.period_number === entry.period_number);
          const timeStr = periodInfo ? `${periodInfo.start_time}–${periodInfo.end_time}` : `Period ${entry.period_number}`;
          const subjectName = subjects.find(s => s.id === entry.subject_id)?.name || 'Class';

          // Find substitute teacher's user_id from face_descriptors (teacher_record_id maps to face descriptor id)
          const { data: subTeacherProfile } = await supabase
            .from('face_descriptors')
            .select('user_id')
            .eq('id', freeTeacher.id)
            .maybeSingle();

          if (subTeacherProfile?.user_id) {
            await supabase.from('notifications').insert({
              user_id: subTeacherProfile.user_id,
              title: `📋 Substitution Assignment`,
              message: `You have been assigned to cover ${subjectName} for ${getCategoryLabel(category)} during ${timeStr} (replacing ${entry.teacher_name}).`,
              type: 'substitution',
            });
          }

          // Mark this teacher as busy for this period
          busyThisPeriod.add(freeTeacher.id);
          busyByPeriod.set(entry.period_number, busyThisPeriod);
          assignedCount++;
        }
      }

      loadAll();
      toast({
        title: assignedCount > 0 ? `${assignedCount} Substitutes Assigned` : 'No Substitutions Needed',
        description: assignedCount > 0
          ? `Auto-assigned ${assignedCount} substitute teacher(s) for today.`
          : 'All scheduled teachers are present or already have substitutes.',
      });
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'Failed to find substitutes', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  // --- Print Daily Substitution Report (all classes) ---
  const printDailySubstitutionReport = async () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const dayName = format(new Date(), 'EEEE, MMMM d, yyyy');

    const { data: allSubs } = await supabase
      .from('substitutions')
      .select('*')
      .eq('date', today)
      .order('category')
      .order('period_number');

    const { data: timings } = await supabase
      .from('period_timings')
      .select('*')
      .order('period_number');

    const timingsMap = new Map((timings || []).map((t: any) => [t.period_number, t]));

    const grouped: Record<string, any[]> = {};
    (allSubs || []).forEach((s: any) => {
      if (!grouped[s.category]) grouped[s.category] = [];
      grouped[s.category].push(s);
    });

    const totalAbsent = new Set((allSubs || []).map((s: any) => s.absent_teacher_id)).size;
    const totalSubs = (allSubs || []).length;

    const rows = Object.entries(grouped).map(([cat, subs]) =>
      subs.map((s: any, i: number) => {
        const pt = timingsMap.get(s.period_number);
        const time = pt ? `${(pt as any).start_time}\u2013${(pt as any).end_time}` : '';
        return `<tr>
          ${i === 0 ? `<td rowspan="${subs.length}" style="border:1px solid #d1d5db;padding:8px 12px;font-weight:600;vertical-align:top;background:#f9fafb;">${getCategoryLabel(cat)}</td>` : ''}
          <td style="border:1px solid #d1d5db;padding:8px 12px;text-align:center;">Period ${s.period_number}${time ? `<br/><span style="font-size:11px;color:#6b7280;">${time}</span>` : ''}</td>
          <td style="border:1px solid #d1d5db;padding:8px 12px;color:#dc2626;">${s.absent_teacher_name}</td>
          <td style="border:1px solid #d1d5db;padding:8px 12px;color:#16a34a;font-weight:600;">${s.substitute_teacher_name}</td>
          <td style="border:1px solid #d1d5db;padding:8px 12px;text-align:center;">
            <span style="background:${s.auto_assigned ? '#dbeafe' : '#fef3c7'};color:${s.auto_assigned ? '#1d4ed8' : '#92400e'};padding:2px 8px;border-radius:12px;font-size:11px;">${s.auto_assigned ? 'Auto' : 'Manual'}</span>
          </td>
        </tr>`;
      }).join('')
    ).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Daily Substitution Report</title>
    <style>
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } @page { margin: 15mm; } }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111827; max-width: 900px; margin: 0 auto; padding: 20px; }
      .header { text-align: center; border-bottom: 3px solid #1d4ed8; padding-bottom: 16px; margin-bottom: 24px; }
      .header h1 { font-size: 22px; margin: 0 0 4px; color: #1d4ed8; }
      .header p { margin: 2px 0; color: #6b7280; font-size: 13px; }
      .stats { display: flex; gap: 16px; margin-bottom: 20px; }
      .stat-box { flex: 1; background: #f0f9ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 12px; text-align: center; }
      .stat-box .num { font-size: 28px; font-weight: 700; color: #1d4ed8; }
      .stat-box .lbl { font-size: 11px; color: #6b7280; text-transform: uppercase; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; }
      th { background: #1d4ed8; color: white; padding: 10px 12px; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
      .footer { text-align: center; margin-top: 30px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; }
    </style></head><body>
      <div class="header">
        <h1>Daily Substitution Report</h1>
        <p><strong>${dayName}</strong></p>
        <p>Generated at ${format(new Date(), 'hh:mm a')}</p>
      </div>
      <div class="stats">
        <div class="stat-box"><div class="num">${totalAbsent}</div><div class="lbl">Absent Teachers</div></div>
        <div class="stat-box"><div class="num">${totalSubs}</div><div class="lbl">Substitutions</div></div>
        <div class="stat-box"><div class="num">${Object.keys(grouped).length}</div><div class="lbl">Classes Affected</div></div>
      </div>
      ${totalSubs === 0 ? '<div style="text-align:center;padding:40px;color:#6b7280;">All teachers are present today. No substitutions needed.</div>' : `
      <table>
        <thead><tr><th>Class</th><th style="text-align:center;">Period</th><th>Absent Teacher</th><th>Substitute</th><th style="text-align:center;">Type</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`}
      <div class="footer">School Attendance System &bull; Substitution Report &bull; ${dayName}</div>
    </body></html>`;

    const w = window.open('', '_blank', 'width=900,height=700');
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 500); }
  };

  const classTeacher = classTeachers.find(ct => ct.role === 'class_teacher');
  const subjectTeacherList = classTeachers.filter(ct => ct.role === 'subject_teacher');

  const getTimetableEntry = (day: number, period: number) =>
    timetable.find(t => t.day_of_week === day && t.period_number === period);

  const getSubjectName = (id: string | null) => {
    if (!id) return '—';
    return subjects.find(s => s.id === id)?.short_name || subjects.find(s => s.id === id)?.name || '—';
  };

  if (isLoading) {
    return <div className="flex items-center justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={onBack}><ChevronLeft className="h-4 w-4" /></Button>
        <div>
          <h2 className="text-xl font-semibold">{getCategoryLabel(category)} — Teacher & Timetable</h2>
          <p className="text-sm text-muted-foreground">Assign teachers and manage class timetable</p>
        </div>
      </div>

      <Tabs defaultValue="teachers" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="teachers" className="text-xs sm:text-sm"><GraduationCap className="w-4 h-4 mr-1.5 hidden sm:inline" />Teachers</TabsTrigger>
          <TabsTrigger value="timetable" className="text-xs sm:text-sm"><CalendarClock className="w-4 h-4 mr-1.5 hidden sm:inline" />Timetable</TabsTrigger>
          <TabsTrigger value="substitution" className="text-xs sm:text-sm"><UserCheck className="w-4 h-4 mr-1.5 hidden sm:inline" />Substitution</TabsTrigger>
        </TabsList>

        {/* ====== TEACHERS TAB ====== */}
        <TabsContent value="teachers" className="space-y-6 mt-4">
          {/* Class Teacher */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><GraduationCap className="w-4 h-4 text-primary" />Class Teacher</CardTitle>
            </CardHeader>
            <CardContent>
              {classTeacher ? (
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div>
                    <p className="font-medium">{classTeacher.teacher_name}</p>
                    <Badge variant="secondary" className="mt-1">Class Teacher</Badge>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeTeacher(classTeacher.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                </div>
              ) : (
                <Select onValueChange={(val) => assignTeacher('class_teacher', val)}>
                  <SelectTrigger><SelectValue placeholder="Select class teacher..." /></SelectTrigger>
                  <SelectContent>
                    {teachers.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name} ({t.employee_id})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </CardContent>
          </Card>

          {/* Subject Teachers */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2"><BookOpen className="w-4 h-4 text-primary" />Subject Teachers</CardTitle>
                <Dialog open={addSubjectOpen} onOpenChange={setAddSubjectOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm"><Plus className="w-4 h-4 mr-1" />Add Subject</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Add New Subject</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      <div><Label>Subject Name</Label><Input value={newSubjectName} onChange={e => setNewSubjectName(e.target.value)} placeholder="e.g. Mathematics" className="mt-1" /></div>
                      <div><Label>Short Name</Label><Input value={newSubjectShort} onChange={e => setNewSubjectShort(e.target.value)} placeholder="e.g. Math" className="mt-1" /></div>
                      <Button onClick={addSubject} className="w-full"><Plus className="w-4 h-4 mr-2" />Add Subject</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {subjectTeacherList.map(st => (
                <div key={st.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div>
                    <p className="font-medium">{st.teacher_name}</p>
                    <Badge variant="outline" className="mt-1">{getSubjectName(st.subject_id)}</Badge>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeTeacher(st.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                </div>
              ))}

              {subjects.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t">
                  {subjects.map(subject => {
                    const assigned = subjectTeacherList.find(st => st.subject_id === subject.id);
                    if (assigned) return null;
                    return (
                      <div key={subject.id} className="space-y-1.5">
                        <Label className="text-xs">{subject.name}</Label>
                        <Select onValueChange={(val) => assignTeacher('subject_teacher', val, subject.id)}>
                          <SelectTrigger className="h-9"><SelectValue placeholder="Assign teacher..." /></SelectTrigger>
                          <SelectContent>
                            {teachers.map(t => (
                              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </div>
              )}

              {subjects.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No subjects added yet. Add subjects first to assign teachers.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ====== TIMETABLE TAB ====== */}
        <TabsContent value="timetable" className="space-y-4 mt-4">
          {/* Day selector */}
          <div className="flex gap-1.5 overflow-x-auto pb-2">
            {[1, 2, 3, 4, 5, 6].map(day => (
              <Button
                key={day}
                variant={selectedDay === day ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedDay(day)}
                className="whitespace-nowrap"
              >
                {DAY_SHORT[day]}
              </Button>
            ))}
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{DAY_NAMES[selectedDay]} Timetable</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">Period</TableHead>
                      <TableHead className="w-28">Time</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Teacher</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {periodTimings.map(pt => {
                      if (pt.is_break) {
                        return (
                          <TableRow key={pt.period_number} className="bg-muted/30">
                            <TableCell colSpan={5} className="text-center text-sm text-muted-foreground font-medium py-2">
                              ☕ {pt.label || 'Break'} ({pt.start_time.slice(0, 5)} - {pt.end_time.slice(0, 5)})
                            </TableCell>
                          </TableRow>
                        );
                      }
                      const entry = getTimetableEntry(selectedDay, pt.period_number);
                      return (
                        <TableRow key={pt.period_number}>
                          <TableCell className="font-medium">{pt.label || `P${pt.period_number}`}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{pt.start_time.slice(0, 5)} - {pt.end_time.slice(0, 5)}</TableCell>
                          <TableCell>
                            {entry ? (
                              <Badge variant="secondary">{getSubjectName(entry.subject_id)}</Badge>
                            ) : (
                              <Select onValueChange={(val) => {
                                // Temporarily store subject, need teacher too
                                const sel = document.querySelector(`[data-period="${pt.period_number}"]`) as HTMLSelectElement;
                                if (sel?.value) setTimetableEntry(selectedDay, pt.period_number, sel.value, val);
                              }}>
                                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Subject" /></SelectTrigger>
                                <SelectContent>
                                  {subjects.map(s => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}
                                </SelectContent>
                              </Select>
                            )}
                          </TableCell>
                          <TableCell>
                            {entry ? (
                              <span className="text-sm">{entry.teacher_name}</span>
                            ) : (
                              <Select onValueChange={(val) => setTimetableEntry(selectedDay, pt.period_number, val, null)}>
                                <SelectTrigger className="h-8 text-xs" data-period={pt.period_number}><SelectValue placeholder="Teacher" /></SelectTrigger>
                                <SelectContent>
                                  {teachers.map(t => (<SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>))}
                                </SelectContent>
                              </Select>
                            )}
                          </TableCell>
                          <TableCell>
                            {entry && (
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeTimetableEntry(selectedDay, pt.period_number)}>
                                <Trash2 className="w-3.5 h-3.5 text-destructive" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ====== SUBSTITUTION TAB ====== */}
        <TabsContent value="substitution" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Today's Substitutions</h3>
              <p className="text-sm text-muted-foreground">{format(new Date(), 'EEEE, MMM d yyyy')}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={printDailySubstitutionReport}>
                <Printer className="w-4 h-4 mr-2" />
                Print Report
              </Button>
              <Button onClick={findSubstitutes} disabled={isSaving}>
                {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                Auto-Assign Substitutes
              </Button>
            </div>
          </div>

          {substitutions.length === 0 ? (
            <Card className="p-8 text-center">
              <UserCheck className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No Substitutions Today</h3>
              <p className="text-sm text-muted-foreground">Click "Auto-Assign Substitutes" to check for absent teachers and assign replacements.</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {substitutions.map(sub => (
                <Card key={sub.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">Period {sub.period_number}</Badge>
                          {sub.auto_assigned && <Badge variant="secondary" className="text-[10px]">Auto</Badge>}
                          <Badge variant={sub.status === 'assigned' ? 'default' : 'secondary'}>{sub.status}</Badge>
                        </div>
                        <div className="flex items-center gap-2 text-sm mt-2">
                          <span className="text-destructive font-medium line-through">{sub.absent_teacher_name}</span>
                          <span className="text-muted-foreground">→</span>
                          <span className="text-green-600 dark:text-green-400 font-medium">{sub.substitute_teacher_name}</span>
                        </div>
                      </div>
                      <AlertTriangle className="w-5 h-5 text-amber-500" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ClassTeacherManager;
