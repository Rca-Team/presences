
import React, { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import PageLayout from '@/components/layouts/PageLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { 
  Layout, 
  BarChart3, 
  Users, 
  UserCheck, 
  UserX, 
  Clock,
  TrendingUp
} from 'lucide-react';
import { GradientCard } from '@/components/ui/gradient-card';
import { ProgressRing } from '@/components/ui/progress-ring';

// Import refactored components
import DashboardCharts from '@/components/dashboard/DashboardCharts';
import RecentActivity from '@/components/dashboard/RecentActivity';
import StatusChart from '@/components/dashboard/StatusChart';
import RegisteredFaces from '@/components/dashboard/RegisteredFaces';
import CutoffTimeDisplay from '@/components/dashboard/CutoffTimeDisplay';
import AIInsightsCard from '@/components/dashboard/AIInsightsCard';

// Import services
import { 
  fetchAttendanceStats, 
  fetchRegisteredFaces 
} from '@/services/dashboard/dashboardService';

const Dashboard = () => {
  const [currentUser, setCurrentUser] = React.useState<any>(null);

  React.useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setCurrentUser(user);
    });
  }, []);
  // Real-time attendance data with Supabase subscriptions
  const { 
    data, 
    isLoading, 
    error,
    refetch: refetchStats 
  } = useQuery({
    queryKey: ['dashboardStats'],
    queryFn: fetchAttendanceStats,
    refetchInterval: 10000, // Faster polling for more real-time feel
  });

  // Setup real-time subscription
  React.useEffect(() => {
    const channel = supabase
      .channel('attendance-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'attendance_records'
        },
        () => {
          console.log('Real-time update detected, refetching...');
          refetchStats();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetchStats]);
  
  // Create a memoized refetch function
  const refetchDashboard = useCallback(() => {
    refetchStats();
    refetchFaces();
  }, [refetchStats]);
  
  // Fetch registered faces
  const { 
    data: registeredFaces, 
    isLoading: facesLoading, 
    error: facesError,
    refetch: refetchFaces
  } = useQuery({
    queryKey: ['registeredFaces'],
    queryFn: fetchRegisteredFaces,
    refetchInterval: 30000, // Updated to 30 seconds for efficient polling
  });
  
  // Check for error state
  if (error) {
    console.error('Error fetching dashboard data:', error);
  }
  
  if (facesError) {
    console.error('Error fetching registered faces:', facesError);
  }
  
  return (
    <PageLayout className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl animate-pulse-subtle" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse-subtle" style={{ animationDelay: '1s' }} />
      </div>

      <div className="relative">
        <PageHeader
          title={
            <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
              Attendance Dashboard
            </span>
          }
          description="Real-time overview of attendance statistics and analytics"
          className="animate-slide-in-down"
          icon={<Layout className="h-8 w-8 text-cyan-400" />}
        >
          <Link to="/attendance">
            <Button className="bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 shadow-lg hover:shadow-cyan-500/50 transition-all duration-300">
              <BarChart3 className="h-4 w-4 mr-2" />
              Take Attendance
            </Button>
          </Link>
        </PageHeader>

        {/* Cutoff Time Display */}
        <div className="mb-8 animate-slide-in-up">
          <CutoffTimeDisplay />
        </div>

        {/* Stats Cards with GradientCard */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8 animate-slide-in-up" style={{ animationDelay: '0.1s' }}>
          <GradientCard
            title="Total Students"
            value={data?.totalUsers || 0}
            icon={Users}
            gradient="cyan"
            trend={{ value: 12, positive: true }}
          />
          <GradientCard
            title="Present Today"
            value={data?.presentToday || 0}
            icon={UserCheck}
            gradient="green"
            subtitle={`${data?.presentPercentage || 0}% attendance`}
          />
          <GradientCard
            title="Weekly Average"
            value={`${data?.weeklyAverage || 0}%`}
            icon={TrendingUp}
            gradient="blue"
            trend={{ value: 5, positive: true }}
          />
          <div className="relative overflow-hidden rounded-xl border bg-card p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl from-purple-500/20 via-purple-400/10 to-transparent border-purple-500/30">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 via-purple-400/10 to-transparent opacity-50" />
            <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl opacity-30 bg-purple-400" />
            <div className="relative flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Attendance Rate</p>
                <p className="mt-2 text-3xl font-bold tracking-tight">{data?.presentPercentage || 0}%</p>
              </div>
              <ProgressRing 
                value={data?.presentPercentage || 0} 
                size="lg" 
                color={data?.presentPercentage >= 80 ? 'success' : data?.presentPercentage >= 60 ? 'warning' : 'destructive'}
                showValue={false}
              >
                <Clock className="h-6 w-6 text-purple-400" />
              </ProgressRing>
            </div>
          </div>
        </div>

        {/* Charts */}
        <div className="animate-slide-in-up" style={{ animationDelay: '0.2s' }}>
          <DashboardCharts 
            isLoading={isLoading} 
            weeklyData={data?.weeklyData} 
            departmentData={data?.departmentData} 
          />
        </div>

        {/* Recent Activity & Status */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8 animate-slide-in-up" style={{ animationDelay: '0.3s' }}>
          <div className="lg:col-span-2">
            <RecentActivity 
              isLoading={isLoading} 
              activityData={data?.recentActivity} 
            />
          </div>
          <StatusChart 
            isLoading={isLoading} 
            statusData={data?.statusData} 
          />
        </div>

        {/* Registered Faces */}
        <div className="animate-slide-in-up" style={{ animationDelay: '0.4s' }}>
          <RegisteredFaces 
            isLoading={facesLoading} 
            faces={registeredFaces} 
            refetchFaces={refetchFaces} 
          />
        </div>

        {/* AI Insights Card */}
        <div className="animate-slide-in-up mt-6" style={{ animationDelay: '0.5s' }}>
          <AIInsightsCard userId={currentUser?.id} />
        </div>
      </div>
    </PageLayout>
  );
};

export default Dashboard;
