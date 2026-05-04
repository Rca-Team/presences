import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GradientCard } from '@/components/ui/gradient-card';
import { ProgressRing } from '@/components/ui/progress-ring';
import { 
  Users, 
  ClipboardCheck, 
  BarChart3, 
  User, 
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  FolderKanban,
  Camera,
  Bell,
  TrendingUp,
  Zap,
  RefreshCw
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useRealtimeAttendance } from '@/hooks/useRealtimeAttendance';
import AttendanceTrendsChart from './AttendanceTrendsChart';
import { useIsMobile } from '@/hooks/use-mobile';

type Category = 'A' | 'B' | 'C' | 'D';

interface Permission {
  id: string;
  category: string;
  can_take_attendance: boolean;
  can_view_reports: boolean;
}

interface StudentRecord {
  id: string;
  user_id: string;
  name: string;
  employee_id: string;
  image_url: string;
  category: string;
  todayStatus?: string;
  todayTime?: string;
}

interface CategoryStats {
  category: string;
  total: number;
  present: number;
  absent: number;
  late: number;
}

interface RecentAttendance {
  id: string;
  name: string;
  category: string;
  status: string;
  time: string;
  image_url: string;
}

const TeacherDashboard: React.FC = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [categoryStats, setCategoryStats] = useState<CategoryStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [currentTeacher, setCurrentTeacher] = useState<{ name: string; id: string } | null>(null);
  const [activeView, setActiveView] = useState<'students' | 'trends'>('students');
  const [recentAttendance, setRecentAttendance] = useState<RecentAttendance[]>([]);

  const fetchTeacherPermissions = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast({
          title: 'Not Authenticated',
          description: 'Please log in to access the teacher dashboard',
          variant: 'destructive',
        });
        return;
      }

      // Get teacher permissions
      const { data: permData, error: permError } = await supabase
        .from('teacher_permissions')
        .select('*')
        .eq('user_id', user.id);

      if (permError) throw permError;

      if (!permData || permData.length === 0) {
        setPermissions([]);
        setIsLoading(false);
        return;
      }

      setPermissions(permData);
      
      // Set first category as selected
      if (permData.length > 0 && !selectedCategory) {
        setSelectedCategory(permData[0].category);
      }

      // Fetch teacher info
      const { data: teacherRecord } = await supabase
        .from('attendance_records')
        .select('device_info')
        .eq('user_id', user.id)
        .eq('category', 'Teacher')
        .single();

      if (teacherRecord) {
        const deviceInfo = teacherRecord.device_info as any;
        setCurrentTeacher({
          name: deviceInfo?.metadata?.name || 'Teacher',
          id: user.id,
        });
      }

    } catch (error) {
      console.error('Error fetching permissions:', error);
      toast({
        title: 'Error',
        description: 'Failed to load teacher permissions',
        variant: 'destructive',
      });
    }
  }, [toast, selectedCategory]);

  const fetchStudentsAndStats = useCallback(async () => {
    if (permissions.length === 0) return;

    try {
      const categories = permissions.map(p => p.category);
      const today = format(new Date(), 'yyyy-MM-dd');

      // Fetch registered students in assigned categories
      const { data: studentRecords, error: studentsError } = await supabase
        .from('attendance_records')
        .select('id, user_id, device_info, image_url, category, timestamp, status')
        .in('category', categories)
        .eq('status', 'registered');

      if (studentsError) throw studentsError;

      // Fetch today's attendance for these categories
      const { data: todayAttendance, error: attendanceError } = await supabase
        .from('attendance_records')
        .select('user_id, status, timestamp')
        .in('category', categories)
        .in('status', ['present', 'late', 'absent'])
        .gte('timestamp', `${today}T00:00:00`)
        .lte('timestamp', `${today}T23:59:59`);

      if (attendanceError) throw attendanceError;

      // Process student records
      const processedStudents: StudentRecord[] = (studentRecords || []).map(record => {
        const deviceInfo = record.device_info as any;
        const metadata = deviceInfo?.metadata || {};
        
        // Find today's attendance for this student
        const todayRecord = todayAttendance?.find(a => a.user_id === record.user_id);
        
        return {
          id: record.id,
          user_id: record.user_id || record.id,
          name: metadata.name || 'Unknown',
          employee_id: metadata.employee_id || 'N/A',
          image_url: record.image_url || metadata.firebase_image_url || '',
          category: record.category || 'A',
          todayStatus: todayRecord?.status,
          todayTime: todayRecord?.timestamp 
            ? format(new Date(todayRecord.timestamp), 'hh:mm a') 
            : undefined,
        };
      }).filter(s => s.name !== 'Unknown');

      setStudents(processedStudents);

      // Calculate category stats
      const stats: CategoryStats[] = categories.map(cat => {
        const categoryStudents = processedStudents.filter(s => s.category === cat);
        const categoryAttendance = todayAttendance?.filter(a => {
          const student = processedStudents.find(s => s.user_id === a.user_id);
          return student?.category === cat;
        }) || [];

        return {
          category: cat,
          total: categoryStudents.length,
          present: categoryAttendance.filter(a => a.status === 'present').length,
          late: categoryAttendance.filter(a => a.status === 'late').length,
          absent: categoryStudents.length - categoryAttendance.length,
        };
      });

      setCategoryStats(stats);
    } catch (error) {
      console.error('Error fetching students:', error);
    }
  }, [permissions]);

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await fetchTeacherPermissions();
      setIsLoading(false);
    };
    init();
  }, [fetchTeacherPermissions]);

  useEffect(() => {
    fetchStudentsAndStats();
  }, [fetchStudentsAndStats]);

  // Real-time subscription for attendance updates
  useEffect(() => {
    if (permissions.length === 0) return;

    const categories = permissions.map(p => p.category);
    
    const channel = supabase
      .channel('teacher-attendance-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'attendance_records',
        },
        (payload) => {
          // Check if the change is in a category we care about
          const record = payload.new as any;
          if (record?.category && categories.includes(record.category)) {
            // Fetch the student name for the notification
            if (payload.eventType === 'INSERT' && (record.status === 'present' || record.status === 'late')) {
              const deviceInfo = record.device_info;
              const studentName = deviceInfo?.metadata?.name || 'A student';
              
              toast({
                title: 'Attendance Recorded',
                description: `${studentName} marked ${record.status} in Category ${record.category}`,
              });
            }
            
            // Refresh data
            fetchStudentsAndStats();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [permissions, toast, fetchStudentsAndStats]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchStudentsAndStats();
    setIsRefreshing(false);
    toast({
      title: 'Refreshed',
      description: 'Attendance data updated',
    });
  };

  const handleTakeAttendance = () => {
    navigate('/attendance');
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'present': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'late': return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'absent': return <XCircle className="h-4 w-4 text-red-500" />;
      default: return <div className="h-4 w-4 rounded-full border-2 border-muted" />;
    }
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'present': return <Badge className="bg-green-500/20 text-green-500 border-green-500/30">Present</Badge>;
      case 'late': return <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30">Late</Badge>;
      case 'absent': return <Badge className="bg-red-500/20 text-red-500 border-red-500/30">Absent</Badge>;
      default: return <Badge variant="secondary">Not Marked</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (permissions.length === 0) {
    return (
      <Card className="p-8">
        <div className="text-center space-y-4">
          <FolderKanban className="h-16 w-16 mx-auto text-muted-foreground opacity-50" />
          <h3 className="text-xl font-semibold">No Categories Assigned</h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            You don't have any categories assigned to you yet. 
            Please contact the principal or administrator to get category access.
          </p>
        </div>
      </Card>
    );
  }

  const currentCategoryStats = categoryStats.find(s => s.category === selectedCategory);
  const filteredStudents = students.filter(s => s.category === selectedCategory);
  const currentPermission = permissions.find(p => p.category === selectedCategory);

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
        <CardContent className="pt-6">
          <div className={`flex ${isMobile ? 'flex-col gap-4' : 'items-center justify-between'}`}>
            <div>
              <h2 className={`${isMobile ? 'text-xl' : 'text-2xl'} font-bold`}>
                Welcome, {currentTeacher?.name || 'Teacher'}
              </h2>
              <p className="text-muted-foreground text-sm">
                You have access to {permissions.length} {permissions.length === 1 ? 'category' : 'categories'}
              </p>
            </div>
            <div className={`flex gap-2 ${isMobile ? 'w-full' : ''}`}>
              <Button 
                variant="outline" 
                onClick={handleRefresh} 
                disabled={isRefreshing}
                className={isMobile ? 'flex-1' : ''}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              {currentPermission?.can_take_attendance && (
                <Button onClick={handleTakeAttendance} size={isMobile ? 'default' : 'lg'} className={isMobile ? 'flex-1' : ''}>
                  <Camera className="h-5 w-5 mr-2" />
                  Take Attendance
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Category Tabs */}
      <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
        <TabsList className={`mb-4 ${isMobile ? 'w-full flex-wrap h-auto gap-1 p-1' : ''}`}>
          {permissions.map(perm => (
            <TabsTrigger 
              key={perm.category} 
              value={perm.category} 
              className={`flex items-center gap-2 ${isMobile ? 'flex-1 min-w-[100px]' : ''}`}
            >
              <FolderKanban className="h-4 w-4" />
              <span className={isMobile ? 'text-xs' : ''}>
                {isMobile ? perm.category : `Category ${perm.category}`}
              </span>
              <Badge variant="secondary" className={`ml-1 ${isMobile ? 'text-xs px-1' : ''}`}>
                {students.filter(s => s.category === perm.category).length}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>

        {permissions.map(perm => (
          <TabsContent key={perm.category} value={perm.category} className="space-y-6">
            {/* Category Stats with GradientCard */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <GradientCard
                title="Total Students"
                value={currentCategoryStats?.total || 0}
                icon={Users}
                gradient="blue"
              />
              <GradientCard
                title="Present Today"
                value={currentCategoryStats?.present || 0}
                icon={CheckCircle2}
                gradient="green"
              />
              <GradientCard
                title="Late Today"
                value={currentCategoryStats?.late || 0}
                icon={Clock}
                gradient="orange"
              />
              <GradientCard
                title="Absent Today"
                value={currentCategoryStats?.absent || 0}
                icon={XCircle}
                gradient="pink"
              />
            </div>

            {/* Permissions Info */}
            <div className="flex gap-2">
              {perm.can_take_attendance && (
                <Badge variant="outline" className="gap-1">
                  <ClipboardCheck className="h-3 w-3" />
                  Can Take Attendance
                </Badge>
              )}
              {perm.can_view_reports && (
                <Badge variant="outline" className="gap-1">
                  <BarChart3 className="h-3 w-3" />
                  Can View Reports
                </Badge>
              )}
            </div>

            {/* Student List */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Students in Category {perm.category}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {filteredStudents.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No students registered in this category</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredStudents.map(student => (
                      <div 
                        key={student.id}
                        className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarImage 
                              src={student.image_url?.startsWith('data:') 
                                ? student.image_url 
                                : student.image_url 
                                  ? `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/face-images/${student.image_url}` 
                                  : ''
                              } 
                              alt={student.name}
                            />
                            <AvatarFallback>
                              <User className="h-5 w-5" />
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{student.name}</p>
                            <p className="text-xs text-muted-foreground">{student.employee_id}</p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          {student.todayTime && (
                            <span className="text-xs text-muted-foreground">
                              {student.todayTime}
                            </span>
                          )}
                          {getStatusBadge(student.todayStatus)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

export default TeacherDashboard;
