import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Scan, Shield, Zap, Fingerprint } from 'lucide-react';

interface SplashAnimationProps {
  onComplete?: () => void;
  duration?: number;
}

const SplashAnimation: React.FC<SplashAnimationProps> = ({
  onComplete,
  duration = 3500,
}) => {
  const [progress, setProgress] = useState(0);
  const [isExiting, setIsExiting] = useState(false);
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) { clearInterval(progressInterval); return 100; }
        return prev + 2;
      });
    }, duration / 50);

    // Phase transitions for text
    const t1 = setTimeout(() => setPhase(1), 800);
    const t2 = setTimeout(() => setPhase(2), 1800);

    const timer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(() => { if (onComplete) onComplete(); }, 600);
    }, duration);

    return () => { clearTimeout(timer); clearTimeout(t1); clearTimeout(t2); clearInterval(progressInterval); };
  }, [duration, onComplete]);

  const loadingText = progress < 25 ? 'Initializing smart school...' :
    progress < 50 ? 'Loading AI modules...' :
    progress < 75 ? 'Connecting systems...' :
    progress < 95 ? 'Preparing dashboard...' : 'System ready';

  return (
    <AnimatePresence>
      {!isExiting && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.05 }}
          transition={{ duration: 0.6 }}
          className="fixed inset-0 flex items-center justify-center z-50 bg-[#03060f] overflow-hidden"
        >
          {/* Radial gradient backdrop */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(6,182,212,0.12)_0%,transparent_70%)]" />
          
          {/* Animated circuit lines */}
          <svg className="absolute inset-0 w-full h-full opacity-[0.04]" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="circuit" width="80" height="80" patternUnits="userSpaceOnUse">
                <path d="M0 40h30m20 0h30M40 0v30m0 20v30" stroke="cyan" strokeWidth="0.5" fill="none"/>
                <circle cx="40" cy="40" r="2" fill="cyan" opacity="0.5"/>
                <circle cx="0" cy="40" r="1" fill="cyan" opacity="0.3"/>
                <circle cx="80" cy="40" r="1" fill="cyan" opacity="0.3"/>
                <circle cx="40" cy="0" r="1" fill="cyan" opacity="0.3"/>
                <circle cx="40" cy="80" r="1" fill="cyan" opacity="0.3"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#circuit)" />
          </svg>

          {/* Floating particles */}
          {[...Array(20)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1 h-1 rounded-full bg-cyan-400/30"
              initial={{
                x: Math.random() * (typeof window !== 'undefined' ? window.innerWidth : 400),
                y: Math.random() * (typeof window !== 'undefined' ? window.innerHeight : 800),
              }}
              animate={{
                y: [null, Math.random() * -200 - 100],
                opacity: [0, 0.6, 0],
              }}
              transition={{
                duration: 3 + Math.random() * 3,
                repeat: Infinity,
                delay: Math.random() * 2,
                ease: "easeOut",
              }}
            />
          ))}

          {/* Main content */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.1, opacity: 0 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="relative flex flex-col items-center z-10"
          >
            {/* Central logo construct */}
            <div className="relative w-40 h-40 md:w-48 md:h-48 mb-10">
              {/* Outer rotating ring */}
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0"
              >
                <svg viewBox="0 0 200 200" className="w-full h-full">
                  <circle cx="100" cy="100" r="95" fill="none" stroke="url(#grad1)" strokeWidth="0.5" strokeDasharray="8 12" opacity="0.4"/>
                  <defs><linearGradient id="grad1"><stop offset="0%" stopColor="#06b6d4"/><stop offset="100%" stopColor="#8b5cf6"/></linearGradient></defs>
                </svg>
              </motion.div>

              {/* Middle pulsing ring */}
              <motion.div
                animate={{ rotate: -360 }}
                transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                className="absolute inset-4"
              >
                <svg viewBox="0 0 200 200" className="w-full h-full">
                  <circle cx="100" cy="100" r="92" fill="none" stroke="cyan" strokeWidth="1" strokeDasharray="4 8" opacity="0.25"/>
                </svg>
              </motion.div>

              {/* Inner glow circle */}
              <motion.div
                animate={{ scale: [1, 1.05, 1], opacity: [0.6, 1, 0.6] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                className="absolute inset-8 rounded-full bg-gradient-to-br from-cyan-500/10 to-violet-500/10 border border-cyan-500/20 backdrop-blur-sm"
              />

              {/* Core icon */}
              <div className="absolute inset-0 flex items-center justify-center">
                <motion.div
                  animate={{ scale: [1, 1.08, 1] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                >
                  <div className="relative">
                    {/* Face scan frame SVG */}
                    <svg viewBox="0 0 64 64" className="w-16 h-16 md:w-20 md:h-20" fill="none">
                      {/* Scan frame corners */}
                      <motion.path d="M16 8h-8v8" stroke="#06b6d4" strokeWidth="2.5" strokeLinecap="round"
                        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1, delay: 0.2 }}/>
                      <motion.path d="M48 8h8v8" stroke="#06b6d4" strokeWidth="2.5" strokeLinecap="round"
                        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1, delay: 0.4 }}/>
                      <motion.path d="M16 56h-8v-8" stroke="#8b5cf6" strokeWidth="2.5" strokeLinecap="round"
                        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1, delay: 0.6 }}/>
                      <motion.path d="M48 56h8v-8" stroke="#8b5cf6" strokeWidth="2.5" strokeLinecap="round"
                        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1, delay: 0.8 }}/>
                      {/* Human head */}
                      <motion.circle cx="32" cy="24" r="8" stroke="#22d3ee" strokeWidth="1.5"
                        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2, delay: 1 }}/>
                      {/* Body/shoulders */}
                      <motion.path d="M16 52c0-8.8 7.2-16 16-16s16 8.8 16 16" stroke="#06b6d4" strokeWidth="1.5" strokeLinecap="round"
                        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1, delay: 1.3 }}/>
                    </svg>

                    {/* Scanning beam */}
                    <motion.div
                      animate={{ y: [-20, 20, -20] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                      className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-400 to-transparent"
                      style={{ top: '50%' }}
                    />
                  </div>
                </motion.div>
              </div>

              {/* Data nodes orbiting */}
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <motion.div
                  key={i}
                  animate={{ rotate: 360 }}
                  transition={{ duration: 6 + i, repeat: Infinity, ease: "linear", delay: i * 0.3 }}
                  className="absolute inset-0"
                >
                  <motion.div
                    animate={{ opacity: [0.3, 0.8, 0.3] }}
                    transition={{ duration: 2, repeat: Infinity, delay: i * 0.2 }}
                    className="absolute w-1.5 h-1.5 rounded-full"
                    style={{
                      top: '50%',
                      left: '50%',
                      transform: `translate(-50%, -50%) translateX(${60 + i * 6}px)`,
                      background: i % 2 === 0 ? '#06b6d4' : '#8b5cf6',
                      boxShadow: `0 0 8px ${i % 2 === 0 ? 'rgba(6,182,212,0.5)' : 'rgba(139,92,246,0.5)'}`,
                    }}
                  />
                </motion.div>
              ))}
            </div>

            {/* Title */}
            <motion.div
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.8 }}
              className="text-center mb-10"
            >
              <h1 className="text-5xl md:text-6xl font-black tracking-wider mb-2">
                <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-violet-400 bg-clip-text text-transparent">
                  PRESENCE
                </span>
              </h1>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: '100%' }}
                transition={{ delay: 0.8, duration: 1 }}
                className="h-px bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent mx-auto mb-3"
              />
              <p className="text-cyan-300/40 text-xs md:text-sm tracking-[0.35em] font-light uppercase">
                Smart School Automation Platform
              </p>
            </motion.div>

            {/* Feature pills */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.7, duration: 0.8 }}
              className="flex flex-wrap justify-center gap-2.5 mb-10"
            >
              {[
                { icon: Fingerprint, text: 'Biometric AI' },
                { icon: Shield, text: 'Secure' },
                { icon: Zap, text: 'Real-time' },
              ].map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.9 + i * 0.15, type: "spring", stiffness: 300 }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium
                    bg-cyan-500/5 border-cyan-500/15 text-cyan-300/70"
                >
                  <item.icon className="w-3 h-3" />
                  {item.text}
                </motion.div>
              ))}
            </motion.div>

            {/* Progress bar */}
            <div className="w-56 md:w-72">
              <div className="relative h-1 bg-white/5 rounded-full overflow-hidden border border-white/5">
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-cyan-500 to-violet-500"
                  style={{ width: `${progress}%` }}
                />
                <motion.div
                  animate={{ x: ['-100%', '200%'] }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                />
              </div>

              <div className="flex items-center justify-between mt-3">
                <span className="text-[10px] text-cyan-400/40 tracking-wider uppercase font-mono">
                  {loadingText}
                </span>
                <span className="text-[10px] font-mono text-cyan-400/60">
                  {Math.round(progress)}%
                </span>
              </div>
            </div>
          </motion.div>

          {/* Horizontal scan line */}
          <motion.div
            animate={{ top: ['0%', '100%', '0%'] }}
            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
            className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent"
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SplashAnimation;
