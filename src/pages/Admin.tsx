import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PageLayout from '@/components/layouts/PageLayout';
import PageTransition from '@/components/PageTransition';
import AdminFacesList from '@/components/admin/AdminFacesList';
import AttendanceCalendar from '@/components/admin/AttendanceCalendar';
import AttendanceCutoffSetting from '@/components/admin/AttendanceCutoffSetting';
import FaceModelUpgradeSettings from '@/components/admin/FaceModelUpgradeSettings';
import AutoNotificationScheduler from '@/components/admin/AutoNotificationScheduler';
import PilotModeSettings from '@/components/admin/PilotModeSettings';
import BulkNotificationService from '@/components/admin/BulkNotificationService';
import CategoryBasedView from '@/components/admin/CategoryBasedView';
import PrincipalDashboard from '@/components/admin/PrincipalDashboard';
import TeacherDashboard from '@/components/admin/TeacherDashboard';
import AttendanceExport from '@/components/admin/AttendanceExport';
import AdminNotificationSender from '@/components/admin/AdminNotificationSender';
import UserAccessManager from '@/components/admin/UserAccessManager';
import BatchIDCardExtractor from '@/components/admin/BatchIDCardExtractor';
import StudentIDCardGenerator from '@/components/admin/StudentIDCardGenerator';
import StudentDetailsTable from '@/components/admin/StudentDetailsTable';
import AttendanceReportGenerator from '@/components/admin/AttendanceReportGenerator';
import ClassSectionReport from '@/components/admin/ClassSectionReport';
import SubstitutionReport from '@/components/admin/SubstitutionReport';
import EmergencyAlertPanel from '@/components/admin/EmergencyAlertPanel';
import NotificationLog from '@/components/admin/NotificationLog';
import AdminInbox from '@/components/admin/AdminInbox';
import AdminTutorial from '@/components/admin/AdminTutorial';
import StudentFaceSamplesManager from '@/components/admin/StudentFaceSamplesManager';
import FaceSamplesDiagnosticsPanel from '@/components/admin/FaceSamplesDiagnosticsPanel';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PullToRefresh } from '@/components/ui/pull-to-refresh';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import {
  User, Calendar, Clock, FolderKanban, School,
  LayoutDashboard, Settings, Bell, Users, BarChart3,
  Shield, Activity, TrendingUp, ChevronRight, Send, UserCog,
  CreditCard, Image, Download, RefreshCw, MessageSquareText, Mail, Siren, CalendarDays } from
'lucide-react';
import TimetableManager from '@/components/admin/TimetableManager';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useUserRole } from '@/hooks/useUserRole';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

interface NavItem {
  id: string;
  icon: React.ElementType;
  label: string;
  group: string;
  badge?: string;
  count?: number;
}

const Admin = () => {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { trigger: haptic } = useHapticFeedback();
  const { role, isLoading: isRoleLoading, isAdminOrPrincipal, isTeacher } = useUserRole();
  const [selectedFaceId, setSelectedFaceId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [activeTab, setActiveTab] = useState('');
  const [attendanceUpdated, setAttendanceUpdated] = useState(false);
  const [nameFilter, setNameFilter] = useState<string>('all');
  const [availableFaces, setAvailableFaces] = useState<{id: string; user_id?: string; name: string; employee_id: string;}[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const [stats, setStats] = useState({
    totalFaces: 0,
    todayAttendance: 0,
    presentToday: 0,
    lateToday: 0
  });

  useEffect(() => {
    if (!isRoleLoading && !activeTab) {
      setActiveTab(isTeacher && !isAdminOrPrincipal ? 'teacher' : 'dashboard');
    }
  }, [isRoleLoading, isTeacher, isAdminOrPrincipal, activeTab]);

  const fetchData = async () => {
    if (!isAdminOrPrincipal) return;
    try {
      const today = new Date().toISOString().split('T')[0];

      // Fetch registered users
      const { data: faceData } = await supabase
        .from('attendance_records')
        .select('id, user_id, device_info, image_url, category')
        .in('status', ['registered', 'pending_approval']);

      const processedUsers = (faceData || []).map(r => {
        const deviceInfo = (r.device_info as any) || {};
        const m = deviceInfo?.metadata || {};
        const name = m.name || deviceInfo.name || '';
        const employeeId = m.employee_id || deviceInfo.employee_id || '';
        return {
          id: r.id,
          user_id: r.user_id,
          name,
          employee_id: employeeId,
          category: r.category || 'A',
        };
      }).filter(u => u.name && u.name !== 'Unknown' && u.name !== 'User');

      // Deduplicate by employee_id first, then by registration record id.
      // Do NOT use user_id as a fallback: many students can share the same user_id
      // when one admin account performs bulk registrations.
      const uniqueFaces = processedUsers.reduce((acc: {id: string; user_id?: string; name: string; employee_id: string;}[], u) => {
        const identity = u.employee_id || u.id;
        if (!acc.some(f => f.id === identity || (!!u.employee_id && f.employee_id === u.employee_id))) {
          acc.push({ id: identity, user_id: u.user_id || undefined, name: u.name, employee_id: u.employee_id || identity });
        }
        return acc;
      }, []);
      setAvailableFaces(uniqueFaces);

      // Fetch today's attendance
      const { data: todayData } = await supabase
        .from('attendance_records')
        .select('id, user_id, status, device_info')
        .in('status', ['present', 'late', 'unauthorized'])
        .gte('timestamp', `${today}T00:00:00`)
        .lte('timestamp', `${today}T23:59:59`);

      // Fetch today's gate entries
      const { data: gateData } = await supabase
        .from('gate_entries')
        .select('student_id, student_name, entry_time')
        .gte('entry_time', `${today}T00:00:00`)
        .lte('entry_time', `${today}T23:59:59`)
        .eq('is_recognized', true);

      // Build present/late maps (same logic as PrincipalDashboard)
      const presentMap = new Set<string>();
      const lateMap = new Set<string>();

      const normalizeStatus = (s: string) => {
        const lower = (s || '').toLowerCase().trim();
        if (lower === 'unauthorized' || lower.includes('present')) return 'present';
        if (lower.includes('late')) return 'late';
        return lower;
      };

      (todayData || []).forEach(r => {
        const m = (r.device_info as any)?.metadata || {};
        const empId = m.employee_id || (r.device_info as any)?.employee_id || r.user_id;
        const normalized = normalizeStatus(r.status || '');
        if (empId) {
          if (normalized === 'present') { presentMap.add(empId); lateMap.delete(empId); }
          else if (normalized === 'late' && !presentMap.has(empId)) lateMap.add(empId);
        }
      });

      // Merge gate entries
      (gateData || []).forEach(g => {
        if (g.student_id && !presentMap.has(g.student_id) && !lateMap.has(g.student_id)) {
          presentMap.add(g.student_id);
        }
      });

      // Match each registered user using multi-identifier resolution (same as PrincipalDashboard)
      let totalPresent = 0;
      let totalLate = 0;
      processedUsers.forEach(u => {
        // Keep attendance matching focused on stable student identifiers.
        // user_id is intentionally excluded to avoid cross-student collisions.
        const identifiers = [u.employee_id, u.id].filter(Boolean);
        let matched = false;
        for (const id of identifiers) {
          if (!id) continue;
          if (presentMap.has(id)) { totalPresent++; matched = true; break; }
          if (lateMap.has(id)) { totalLate++; matched = true; break; }
        }
      });

      setStats({
        totalFaces: uniqueFaces.length,
        todayAttendance: totalPresent + totalLate,
        presentToday: totalPresent,
        lateToday: totalLate,
      });

      const { count } = await supabase.
      from('notifications').
      select('*', { count: 'exact', head: true }).
      eq('read', false);
      setNotificationCount(count || 0);
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  };

  useEffect(() => {
    fetchData();
    const channel = supabase.
    channel('admin-dashboard').
    on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_records' }, () => {
      setAttendanceUpdated(true);
      haptic('medium');
      setTimeout(() => fetchData(), 500);
    }).
    on('postgres_changes', { event: '*', schema: 'public', table: 'gate_entries' }, () => {
      setAttendanceUpdated(true);
      haptic('medium');
      setTimeout(() => fetchData(), 500);
    }).
    on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => fetchData()).
    subscribe();
    return () => {supabase.removeChannel(channel);};
  }, [isAdminOrPrincipal]);

  useEffect(() => {
    if (attendanceUpdated) {
      const timer = setTimeout(() => setAttendanceUpdated(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [attendanceUpdated]);

  const handleTabChange = (tab: string) => {
    haptic('selection');
    setActiveTab(tab);
  };

  const handleRefresh = async () => {
    await fetchData();
    toast({ title: "Refreshed", description: "Data updated." });
  };

  if (isRoleLoading) {
    return (
      <PageTransition>
        <PageLayout className="min-h-screen bg-background">
          <div className="p-6 space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-96 w-full" />
          </div>
        </PageLayout>
      </PageTransition>);

  }

  if (isTeacher && !isAdminOrPrincipal) {
    return (
      <PageTransition>
        <PageLayout className="min-h-screen bg-background">
          <TeacherDashboard />
        </PageLayout>
      </PageTransition>);

  }

  const navItems: NavItem[] = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard', group: 'Overview' },
  { id: 'sections', icon: FolderKanban, label: 'Class', group: 'Overview' },
  { id: 'students', icon: Users, label: 'Students', group: 'Overview', badge: attendanceUpdated ? 'new' : undefined },
  { id: 'calendar', icon: Calendar, label: 'Calendar', group: 'Overview' },
  { id: 'idcard', icon: Image, label: 'ID Extract', group: 'Registration' },
  { id: 'idcards', icon: CreditCard, label: 'ID Cards', group: 'Registration' },
  { id: 'reports', icon: BarChart3, label: 'Reports', group: 'Management' },
  { id: 'access', icon: UserCog, label: 'Access', group: 'Management' },
  { id: 'notifications', icon: Bell, label: 'Notifications', group: 'Management', count: notificationCount },
  { id: 'samples', icon: Activity, label: 'Face Samples', group: 'Management' },
  { id: 'notif-log', icon: MessageSquareText, label: 'Delivery Log', group: 'Management' },
  { id: 'inbox', icon: Mail, label: 'Inbox', group: 'Management' },
  { id: 'emergency', icon: Siren, label: 'Emergency', group: 'Management' },
  { id: 'timetable', icon: CalendarDays, label: 'Timetable', group: 'Management' },
  { id: 'settings', icon: Settings, label: 'Settings', group: 'Management' }];


  const groups = ['Overview', 'Registration', 'Management'];

  const statsCards = [
  { label: 'Registered', value: stats.totalFaces, icon: Users, color: 'text-primary' },
  { label: 'Present', value: stats.presentToday, icon: TrendingUp, color: 'text-green-600 dark:text-green-400' },
  { label: 'Late', value: stats.lateToday, icon: Clock, color: 'text-orange-600 dark:text-orange-400' }];


  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <PrincipalDashboard />;
      case 'sections':
        return <CategoryBasedView />;
      case 'students':
        return (
          <AdminFacesList
            viewMode={viewMode}
            selectedFaceId={selectedFaceId}
            nameFilter={nameFilter}
            setSelectedFaceId={(id) => {
              haptic('selection');
              setSelectedFaceId(id);
              if (id) setActiveTab('calendar');
            }} />);


      case 'calendar':
        return <AttendanceCalendar selectedFaceId={selectedFaceId} />;
      case 'idcard':
        return <BatchIDCardExtractor />;
      case 'idcards':
        return <StudentDetailsTable />;
      case 'reports':
        return (
          <div className="space-y-6">
            <SubstitutionReport />
            <ClassSectionReport />
            <AttendanceReportGenerator />
          </div>
        );
      case 'access':
        return <UserAccessManager />;
      case 'notifications':
        return <AdminNotificationSender availableFaces={availableFaces} />;
      case 'samples':
        return (
          <div className="space-y-4">
            <FaceSamplesDiagnosticsPanel />
            <StudentFaceSamplesManager />
          </div>
        );
      case 'notif-log':
        return <NotificationLog />;
      case 'inbox':
        return <AdminInbox />;
      case 'emergency':
        return <EmergencyAlertPanel />;
      case 'timetable':
        return <TimetableManager />;
      case 'settings':
        return (
          <div className="space-y-6">
            <AttendanceCutoffSetting />
            <PilotModeSettings />
            <FaceModelUpgradeSettings />
            <AutoNotificationScheduler />
          </div>);

      default:
        return <PrincipalDashboard />;
    }
  };

  return (
    <PageTransition>
      <PageLayout className="min-h-screen bg-background">
        <div className="flex h-[calc(100dvh-4rem)]">
          {/* Desktop Sidebar */}
          {!isMobile &&
          <aside className={cn(
            "border-r border-border bg-card flex flex-col transition-all duration-200",
            sidebarCollapsed ? "w-16" : "w-56"
          )}>
              <div className="p-3 border-b border-border flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
                  <Shield className="w-4 h-4 text-primary-foreground" />
                </div>
                {!sidebarCollapsed &&
              <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">Admin</p>
                    <p className="text-[10px] text-muted-foreground">Management</p>
                  </div>
              }
              </div>

              <ScrollArea className="flex-1 py-2">
                {groups.map((group) =>
              <div key={group} className="mb-1">
                    {!sidebarCollapsed &&
                <p className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                        {group}
                      </p>
                }
                    {navItems.filter((n) => n.group === group).map((item) => {
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      data-nav-id={item.id}
                      onClick={() => handleTabChange(item.id)}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors",
                        isActive ?
                        "bg-primary/10 text-primary border-r-2 border-primary font-medium" :
                        "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                      title={sidebarCollapsed ? item.label : undefined}>
                      
                          <item.icon className={cn("w-4 h-4 flex-shrink-0", isActive && "text-primary")} />
                          {!sidebarCollapsed &&
                      <>
                              <span className="truncate flex-1 text-left">{item.label}</span>
                              {item.badge &&
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        }
                              {item.count !== undefined && item.count > 0 &&
                        <Badge variant="destructive" className="text-[8px] px-1 py-0 h-3.5 min-w-[14px]">
                          {item.count}
                        </Badge>
                        }
                            </>
                      }
                        </button>);

                })}
                  </div>
              )}
              </ScrollArea>

              <div className="p-2 border-t border-border space-y-1">
                <div className="flex items-center justify-between px-2">
                  <ThemeToggle />
                  <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
                  
                    <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", sidebarCollapsed && "rotate-180")} />
                  </Button>
                </div>
                {!sidebarCollapsed &&
              <div className="flex gap-1">
                    <AttendanceExport />
                    <BulkNotificationService availableFaces={availableFaces} />
                  </div>
              }
              </div>
            </aside>
          }

          {/* Main Content */}
          <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {/* Top Bar - Compact on mobile */}
            <div className="border-b border-border bg-card px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                <div className="min-w-0">
                  <h1 className="text-sm sm:text-lg font-semibold truncate">
                    {navItems.find((n) => n.id === activeTab)?.label || 'Dashboard'}
                  </h1>
                  <p className="text-[10px] sm:text-xs text-muted-foreground hidden sm:block truncate">
                    {activeTab === 'dashboard' && 'Overview of attendance and registered students'}
                    {activeTab === 'students' && 'View and manage all registered students'}
                    {activeTab === 'reports' && 'Generate and export attendance reports'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                <AdminTutorial onNavigate={handleTabChange} />
                <Button variant="ghost" size="icon" className="h-7 w-7 sm:h-8 sm:w-8" onClick={handleRefresh}>
                  <RefreshCw className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </Button>
                {isMobile && <ThemeToggle />}
              </div>
            </div>

            {/* Stats Bar - Scrollable on mobile */}
            <div className="border-b border-border bg-card/50 px-3 sm:px-4 py-1.5 sm:py-2">
              <div className="flex gap-2 sm:gap-4 overflow-x-auto no-scrollbar">
                {statsCards.map((stat, i) =>
                <div key={i} className="flex items-center gap-1.5 py-0.5 min-w-fit">
                    <stat.icon className={cn("w-3.5 h-3.5", stat.color)} />
                    <span className="text-sm sm:text-lg font-bold tabular-nums">{stat.value}</span>
                    <span className="text-[9px] sm:text-xs text-muted-foreground">{stat.label}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Mobile feature navigation moved to top for faster access */}
            {isMobile && (
              <div className="border-b border-border bg-card px-2 py-2 sticky top-0 z-20">
                <div className="flex gap-2 overflow-x-auto no-scrollbar">
                  {navItems.map((item) => {
                    const isActive = activeTab === item.id;
                    return (
                      <Button
                        key={item.id}
                        variant={isActive ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => handleTabChange(item.id)}
                        className="shrink-0 h-8 px-2.5 gap-1.5"
                      >
                        <item.icon className="w-3.5 h-3.5" />
                        <span className="text-[11px]">{item.label}</span>
                        {item.count !== undefined && item.count > 0 && (
                          <Badge variant="destructive" className="text-[8px] h-4 min-w-[14px] px-1">
                            {item.count}
                          </Badge>
                        )}
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Content Area */}
            <PullToRefresh onRefresh={handleRefresh} enabled={isMobile} className="flex-1 overflow-auto">
              <div className="p-2.5 sm:p-4 md:p-6 pb-6">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.15 }}>
                    
                    {renderContent()}
                  </motion.div>
                </AnimatePresence>
              </div>
            </PullToRefresh>
          </main>
        </div>

      </PageLayout>
    </PageTransition>);

};

export default Admin;