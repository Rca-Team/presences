import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type UserRole = 'admin' | 'principal' | 'teacher' | 'user' | null;

interface UseUserRoleReturn {
  role: UserRole;
  isLoading: boolean;
  isAdmin: boolean;
  isPrincipal: boolean;
  isTeacher: boolean;
  isAdminOrPrincipal: boolean;
  userId: string | null;
  refetch: () => Promise<void>;
}

export const useUserRole = (): UseUserRoleReturn => {
  const db = supabase as any;
  const [role, setRole] = useState<UserRole>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const fetchRole = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        setRole(null);
        setUserId(null);
        setIsLoading(false);
        return;
      }

      setUserId(user.id);

      // Check for admin role first
      const { data: adminRole } = await db
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .single();

      if (adminRole) {
        setRole('admin');
        setIsLoading(false);
        return;
      }

      // Check for moderator (principal) role
      const { data: modRole } = await db
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'moderator')
        .single();

      if (modRole) {
        setRole('principal');
        setIsLoading(false);
        return;
      }

      // Check if user is a teacher with permissions
      const { data: teacherPerms } = await db
        .from('teacher_permissions')
        .select('id')
        .eq('user_id', user.id)
        .limit(1);

      if (teacherPerms && teacherPerms.length > 0) {
        setRole('teacher');
        setIsLoading(false);
        return;
      }

      // Check if user is registered as a Teacher category
      const { data: teacherRecord } = await db
        .from('attendance_records')
        .select('id')
        .eq('user_id', user.id)
        .eq('category', 'Teacher')
        .eq('status', 'registered')
        .limit(1);

      if (teacherRecord && teacherRecord.length > 0) {
        setRole('teacher');
        setIsLoading(false);
        return;
      }

      // Default to user role
      setRole('user');
    } catch (error) {
      console.error('Error fetching user role:', error);
      setRole('user');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRole();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        fetchRole();
      } else if (event === 'SIGNED_OUT') {
        setRole(null);
        setUserId(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchRole]);

  return {
    role,
    isLoading,
    isAdmin: role === 'admin',
    isPrincipal: role === 'principal' || role === 'admin',
    isTeacher: role === 'teacher',
    isAdminOrPrincipal: role === 'admin' || role === 'principal',
    userId,
    refetch: fetchRole,
  };
};
