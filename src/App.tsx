import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import Index from "./pages/Index";
import Register from "./pages/Register";
import Attendance from "./pages/Attendance";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import NotFound from "./pages/NotFound";
import Admin from './pages/Admin';
import Contact from './pages/Contact';
import NotificationDemo from './pages/NotificationDemo';
import Profile from './pages/Profile';
import Features from './pages/Features';
import GateMode from './pages/GateMode';
import ParentPortal from './pages/ParentPortal';
import Unsubscribe from './pages/Unsubscribe';
import DataBackup from './pages/DataBackup';
import FaceModelValidator from './pages/FaceModelValidator';
import TeacherPortal from './pages/TeacherPortal';

import SplashAnimation from "./components/SplashAnimation";
import { AttendanceProvider } from './contexts/AttendanceContext';
import { AnimatePresence } from 'framer-motion';
import { ThemeProvider } from './hooks/use-theme';
import MobileSidebar from "./components/MobileSidebar";
import { ProtectedRoute } from './components/ProtectedRoute';
import PWAInstallPrompt from './components/PWAInstallPrompt';
import EmergencyAlertListener from './components/EmergencyAlertListener';
import RealtimeNotificationListener from './components/RealtimeNotificationListener';

const queryClient = new QueryClient();

// This component wraps our routes with AnimatePresence for exit animations
function AnimatedRoutes() {
  const location = useLocation();
  
  return (
    <AnimatePresence mode="wait" initial={false}>
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
    </AnimatePresence>
  );
}

function App() {
  const [showSplash, setShowSplash] = useState(true);

  return (
    <ThemeProvider defaultTheme="dark">
      <AttendanceProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            
            {/* Splash Animation */}
            {showSplash && (
              <SplashAnimation 
                onComplete={() => setShowSplash(false)}
                duration={3500} 
              />
            )}
            
            <BrowserRouter>
              <AnimatedRoutes />
              <MobileSidebar />
              <PWAInstallPrompt />
              <EmergencyAlertListener />
              <RealtimeNotificationListener />
            </BrowserRouter>
          </TooltipProvider>
        </QueryClientProvider>
      </AttendanceProvider>
    </ThemeProvider>
  );
}

export default App;
