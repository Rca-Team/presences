
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import Logo from './Logo';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sun, Moon } from 'lucide-react';
import { Toggle } from '@/components/ui/toggle';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/integrations/supabase/client';
import ProfileDropdown from './ProfileDropdown';
import { useUserRole } from '@/hooks/useUserRole';

const Navbar = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const location = useLocation();
  const isMobile = useIsMobile();
  const { theme, setTheme } = useTheme();
  const { isAdminOrPrincipal, isTeacher, isLoading: isRoleLoading } = useUserRole();
  
  useEffect(() => {
    const handleScroll = () => {
      const offset = window.scrollY;
      setIsScrolled(offset > 10);
    };
    
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const isActive = (path: string) => location.pathname === path;

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <header 
      className={cn(
        "fixed top-0 left-0 right-0 z-50 px-6 md:px-8 py-4",
        isScrolled 
          ? "bg-white/70 dark:bg-black/50 backdrop-blur-2xl shadow-lg border-b border-white/20 dark:border-white/10" 
          : "bg-transparent backdrop-blur-sm"
      )}
      style={{ transition: 'all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <Link to="/" className="animate-ios-bounce">
          <Logo />
        </Link>
        
        {/* Desktop Navigation - Hidden on Mobile */}
        <LayoutGroup>
          <nav className="hidden md:flex items-center gap-1 animate-fade-in bg-muted/50 backdrop-blur-xl rounded-full p-1.5 border border-border/50">
            {[
              { text: 'Home', path: '/', show: true },
              { text: 'Parent Portal', path: '/parent', show: !isAuthenticated },
              { text: 'Profile', path: '/profile', show: isAuthenticated },
              { text: 'Register', path: '/register', show: isAuthenticated },
              { text: 'Attendance', path: '/attendance', show: isAuthenticated },
              { text: 'Gate Mode', path: '/gate', show: isAdminOrPrincipal || isTeacher },
              { text: 'Admin', path: '/admin', show: isAdminOrPrincipal || isTeacher },
            ].filter(item => item.show).map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "relative px-5 py-2.5 rounded-full text-sm font-medium mobile-touch-target",
                  isActive(item.path)
                    ? "text-white"
                    : "text-muted-foreground hover:text-foreground"
                )}
                style={{ transition: 'color 0.3s ease' }}
              >
                {isActive(item.path) && (
                  <motion.div
                    layoutId="navbar-active-pill"
                    className="absolute inset-0 bg-gradient-ios-blue rounded-full shadow-lg shadow-ios-blue/30"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative z-10">
                  {item.text === 'Admin' && isTeacher && !isAdminOrPrincipal ? 'Teacher' : item.text}
                </span>
              </Link>
            ))}
          </nav>
        </LayoutGroup>
        
        {/* Auth section - Only show on desktop */}
        <div className="hidden md:flex items-center gap-3 animate-fade-in">
          <Toggle 
            pressed={theme === 'dark'} 
            onPressedChange={toggleTheme}
            aria-label="Toggle theme"
            className="relative w-11 h-11 rounded-full bg-muted/50 hover:bg-accent backdrop-blur-xl border border-border/50 hover:scale-110 active:scale-95"
            style={{ transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
          >
            {theme === 'dark' ? (
              <Moon className="h-5 w-5 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-ios-purple" />
            ) : (
              <Sun className="h-5 w-5 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-ios-orange animate-pulse-subtle" />
            )}
          </Toggle>
          {isAuthenticated ? (
            <ProfileDropdown />
          ) : (
            <div className="flex items-center gap-2">
              <Link to="/login">
                <Button variant="ghost" size="sm" className="rounded-full px-5">
                  Sign In
                </Button>
              </Link>
              <Link to="/signup">
                <Button variant="ios" size="sm" className="rounded-full px-5 animate-glow-pulse">
                  Get Started
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Navbar;
