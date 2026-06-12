import { lazy, Suspense, useEffect, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Helmet, HelmetProvider } from "react-helmet-async";
import { Skeleton } from "@/components/ui/skeleton";

const Index = lazy(() => import("./pages/Index"));
const Register = lazy(() => import("./pages/Register"));
const Attendance = lazy(() => import("./pages/Attendance"));
const Login = lazy(() => import("./pages/Login"));
const Signup = lazy(() => import("./pages/Signup"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Admin = lazy(() => import('./pages/Admin'));
const Contact = lazy(() => import('./pages/Contact'));
const NotificationDemo = lazy(() => import('./pages/NotificationDemo'));
const Profile = lazy(() => import('./pages/Profile'));
const Features = lazy(() => import('./pages/Features'));
const GateMode = lazy(() => import('./pages/GateMode'));
const ParentPortal = lazy(() => import('./pages/ParentPortal'));
const Unsubscribe = lazy(() => import('./pages/Unsubscribe'));
const DataBackup = lazy(() => import('./pages/DataBackup'));
const FaceModelValidator = lazy(() => import('./pages/FaceModelValidator'));
const TeacherPortal = lazy(() => import('./pages/TeacherPortal'));

import { AttendanceProvider } from './contexts/AttendanceContext';
import { AnimatePresence } from 'framer-motion';
import { ThemeProvider } from './hooks/use-theme';
import MobileAppShell from "./components/mobile/MobileAppShell";
import { ProtectedRoute } from './components/ProtectedRoute';
import PWAInstallPrompt from './components/PWAInstallPrompt';
import EmergencyAlertListener from './components/EmergencyAlertListener';
import RealtimeNotificationListener from './components/RealtimeNotificationListener';
import AppExperienceLayer from './components/AppExperienceLayer';
import SplashAnimation from './components/SplashAnimation';

const queryClient = new QueryClient();

queryClient.setDefaultOptions({
  queries: {
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  },
});

const SITE_URL = "https://presences.dev";

const ROUTE_SEO: Record<string, { title: string; description: string }> = {
  "/": {
    title: "Presences | Smart School Automation Platform",
    description:
      "Automate school attendance, gate security, parent updates, and timetable management with real-time face recognition.",
  },
  "/contact": {
    title: "Contact Presences | School Automation Support",
    description:
      "Contact the Presences team for school onboarding, technical support, and product demos.",
  },
  "/features": {
    title: "Features | Presences Smart School System",
    description:
      "Explore face attendance, gate mode, parent portal, timetable, alerts, analytics, and automation features in Presences.",
  },
  "/login": {
    title: "Login | Presences",
    description:
      "Sign in to Presences to manage attendance, gate operations, and school workflows securely.",
  },
  "/signup": {
    title: "Create Account | Presences",
    description:
      "Create your Presences account to set up smart attendance, classroom tools, and parent communication.",
  },
  "/parent": {
    title: "Parent Portal | Presences",
    description:
      "Track student attendance, receive notifications, and stay connected with school updates in the Presences Parent Portal.",
  },
  "/register": {
    title: "Student Registration | Presences",
    description:
      "Register students quickly with face data capture and profile setup in the Presences platform.",
  },
  "/unsubscribe": {
    title: "Unsubscribe | Presences Notifications",
    description:
      "Manage and unsubscribe from Presences school notification emails.",
  },
};

const getRouteSeo = (pathname: string) => {
  return (
    ROUTE_SEO[pathname] ?? {
      title: "Presences | Smart School Automation",
      description:
        "AI-powered school automation platform for attendance, security, and parent communication.",
    }
  );
};

function SeoHead() {
  const location = useLocation();
  const { title, description } = getRouteSeo(location.pathname);
  const canonical = `${SITE_URL}${location.pathname}`;

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonical} />
      <meta property="og:type" content="website" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      {location.pathname === "/" && (
        <script type="application/ld+json">
          {JSON.stringify([
            {
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: "Presences",
              url: SITE_URL,
              description:
                "AI-powered smart school automation platform for attendance, gate management, and parent communication.",
            },
            {
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "Presences",
              url: SITE_URL,
              logo: `${SITE_URL}/logo.png`,
              sameAs: [SITE_URL, `${SITE_URL.replace('https://', 'https://www.')}`],
            },
            {
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: "Presences",
              applicationCategory: "BusinessApplication",
              operatingSystem: "Web",
              url: SITE_URL,
              description:
                "School automation software for face recognition attendance, gate security, timetable management, and parent portal updates.",
            },
          ])}
        </script>
      )}
    </Helmet>
  );
}

// This component wraps our routes with AnimatePresence for exit animations
function AnimatedRoutes() {
  const location = useLocation();
  const routeFallback = (
    <div className="min-h-[60vh] px-4 py-6 space-y-3">
      <Skeleton className="h-10 w-1/2" />
      <Skeleton className="h-44 w-full" />
      <Skeleton className="h-44 w-full" />
    </div>
  );
  
  return (
    <AnimatePresence mode="wait" initial={false}>
      <Suspense fallback={routeFallback}>
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<Index />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/register" element={<Register />} />
        <Route path="/attendance" element={
          <ProtectedRoute requireRoles={["admin", "principal", "teacher", "user"]}>
            <Attendance />
          </ProtectedRoute>
        } />
        <Route path="/user" element={
          <ProtectedRoute requireRoles={["admin", "principal", "teacher", "user"]}>
            <Attendance />
          </ProtectedRoute>
        } />
        <Route path="/admin" element={
          <ProtectedRoute requireRoles={["admin", "principal", "teacher"]}>
            <Admin />
          </ProtectedRoute>
        } />
        <Route path="/teacher" element={
          <ProtectedRoute requireRoles={["admin", "principal", "teacher"]}>
            <TeacherPortal />
          </ProtectedRoute>
        } />
        <Route path="/notifications" element={
          <ProtectedRoute requireRoles={["admin", "principal"]}>
            <NotificationDemo />
          </ProtectedRoute>
        } />
        <Route path="/profile" element={
          <ProtectedRoute requireRoles={["admin", "principal", "teacher", "user"]}>
            <Profile />
          </ProtectedRoute>
        } />
        <Route path="/features" element={
          <ProtectedRoute requireRoles={["admin", "principal", "teacher", "user"]}>
            <Features />
          </ProtectedRoute>
        } />
        <Route path="/gate" element={
          <ProtectedRoute requireRoles={["admin", "principal", "teacher"]}>
            <GateMode />
          </ProtectedRoute>
        } />
        <Route path="/parent" element={<ParentPortal />} />
        <Route path="/unsubscribe" element={<Unsubscribe />} />
        <Route path="/data" element={
          <ProtectedRoute requireRoles={["admin"]}>
            <DataBackup />
          </ProtectedRoute>
        } />
        <Route path="/__admin/face-model-validator" element={
          <ProtectedRoute requireRoles={["admin"]}>
            <FaceModelValidator />
          </ProtectedRoute>
        } />
        <Route path="*" element={<NotFound />} />
      </Routes>
      </Suspense>
    </AnimatePresence>
  );
}

function App() {
  const [mountNonCritical, setMountNonCritical] = useState(false);
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const schedule = window.setTimeout(() => setMountNonCritical(true), 350);
    return () => {
      window.clearTimeout(schedule);
    };
  }, []);

  useEffect(() => {
    if (!mountNonCritical) return;

    const prefetchTimer = window.setTimeout(() => {
      void import('./pages/Attendance');
      void import('./pages/GateMode');
      void import('./pages/Admin');
      void import('./components/gate/GateModeScanner');
      void import('./components/attendance/FuturisticFaceScanner');
    }, 500);

    return () => window.clearTimeout(prefetchTimer);
  }, [mountNonCritical]);

  useEffect(() => {
    const splashSeen = sessionStorage.getItem('presence:splash-seen');
    if (splashSeen) {
      setShowSplash(false);
    }
  }, []);

  const handleSplashComplete = () => {
    sessionStorage.setItem('presence:splash-seen', '1');
    setShowSplash(false);
  };

  return (
    <ThemeProvider defaultTheme="dark">
      <AttendanceProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            
            <HelmetProvider>
              <div className="premium-glass-app">
                <BrowserRouter>
                  {showSplash ? (
                    <SplashAnimation onComplete={handleSplashComplete} duration={2200} />
                  ) : (
                    <>
                      <MobileAppShell>
                        <SeoHead />
                        <AnimatedRoutes />
                      </MobileAppShell>
                      {mountNonCritical && (
                        <>
                          <AppExperienceLayer />
                          <PWAInstallPrompt />
                          <EmergencyAlertListener />
                          <RealtimeNotificationListener />
                        </>
                      )}
                    </>
                  )}
                </BrowserRouter>
              </div>
            </HelmetProvider>
          </TooltipProvider>
        </QueryClientProvider>
      </AttendanceProvider>
    </ThemeProvider>
  );
}

export default App;
