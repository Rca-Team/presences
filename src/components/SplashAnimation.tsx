import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Logo from '@/components/Logo';

interface SplashAnimationProps {
  onComplete?: () => void;
  duration?: number;
}

const SplashAnimation: React.FC<SplashAnimationProps> = ({
  onComplete,
  duration = 2200,
}) => {
  const [progress, setProgress] = useState(0);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) { clearInterval(progressInterval); return 100; }
        return prev + 2.5;
      });
    }, duration / 50);

    const timer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(() => { if (onComplete) onComplete(); }, 440);
    }, duration);

    return () => {
      clearTimeout(timer);
      clearInterval(progressInterval);
    };
  }, [duration, onComplete]);

  const loadingText =
    progress < 30 ? 'Initializing presence core' :
    progress < 60 ? 'Syncing intelligent modules' :
    progress < 90 ? 'Preparing secure environment' :
    'Launch ready';

  return (
    <AnimatePresence>
      {!isExiting && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45 }}
          className="fixed inset-0 z-50 overflow-hidden"
        >
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(120% 95% at 82% -10%, rgba(255,106,0,.38) 0%, rgba(255,106,0,0) 62%), radial-gradient(110% 90% at -8% 110%, rgba(255,42,109,.28) 0%, rgba(255,42,109,0) 58%), linear-gradient(140deg, #090812 0%, #130b22 42%, #2A0F3F 100%)',
            }}
          />

          <div
            className="absolute inset-0 opacity-[0.32]"
            style={{
              backgroundImage:
                'repeating-linear-gradient(118deg, rgba(255,255,255,.04) 0 14px, transparent 14px 26px), repeating-linear-gradient(24deg, rgba(0,225,255,.06) 0 18px, transparent 18px 32px)',
            }}
          />

          <motion.div
            initial={{ x: '-130%' }}
            animate={{ x: '140%' }}
            transition={{ duration: 1.15, ease: [0.23, 1, 0.32, 1] }}
            className="absolute inset-y-0 w-[38%]"
            style={{
              transform: 'skewX(-28deg)',
              background:
                'linear-gradient(95deg, rgba(255,106,0,0) 0%, rgba(255,106,0,.3) 34%, rgba(255,42,109,.38) 64%, rgba(0,225,255,.28) 100%)',
              filter: 'blur(8px)',
            }}
          />

          {[...Array(10)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute rounded-full"
              style={{
                width: i % 3 === 0 ? 6 : 4,
                height: i % 3 === 0 ? 6 : 4,
                background: i % 2 === 0 ? 'rgba(255,106,0,.48)' : 'rgba(0,225,255,.46)',
                boxShadow: i % 2 === 0 ? '0 0 16px rgba(255,106,0,.45)' : '0 0 16px rgba(0,225,255,.42)',
              }}
              initial={{
                x: Math.random() * (typeof window !== 'undefined' ? window.innerWidth : 400),
                y: Math.random() * (typeof window !== 'undefined' ? window.innerHeight : 800),
              }}
              animate={{
                y: [null, Math.random() * -180 - 80],
                opacity: [0, 0.75, 0],
              }}
              transition={{
                duration: 2.5 + Math.random() * 2,
                repeat: Infinity,
                delay: Math.random() * 2,
                ease: 'easeOut',
              }}
            />
          ))}

          <div className="relative h-full w-full grid grid-cols-1 md:grid-cols-[1.1fr_0.9fr]">
            <motion.div
              initial={{ x: -28, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col items-start justify-center px-8 sm:px-12 md:px-16 pt-20 md:pt-8"
            >
              <div className="px-3 py-1 rounded-full border border-white/20 bg-white/5 text-[10px] tracking-[0.24em] uppercase text-white/70 mb-5">
                Presence OS
              </div>
              <h1 className="font-bold text-4xl sm:text-5xl md:text-6xl leading-[0.95] tracking-tight text-white max-w-xl">
                Presence
                <span className="block text-[0.44em] font-normal tracking-[0.26em] uppercase text-white/65 mt-2">
                  Smart School Automation
                </span>
              </h1>
              <p className="mt-4 text-sm sm:text-base text-white/68 max-w-md">
                {loadingText}
              </p>

              <div className="mt-8 w-full max-w-sm">
                <div className="relative h-1.5 overflow-hidden rounded-full border border-white/15 bg-black/35">
                  <motion.div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{
                      width: `${progress}%`,
                      background: 'linear-gradient(90deg, #FF6A00 0%, #FF2A6D 62%, #00E1FF 100%)',
                    }}
                  />
                  <motion.div
                    animate={{ x: ['-100%', '180%'] }}
                    transition={{ duration: 1.05, repeat: Infinity, ease: 'linear' }}
                    className="absolute inset-y-0 w-[36%]"
                    style={{
                      background: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,.42) 50%, rgba(255,255,255,0) 100%)',
                    }}
                  />
                </div>
                <div className="mt-2.5 flex items-center justify-between text-xs text-white/60">
                  <span>{Math.round(progress)}%</span>
                  <span className="tracking-[0.2em] uppercase">Booting</span>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ x: 32, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.68, ease: [0.22, 1, 0.36, 1], delay: 0.06 }}
              className="relative flex items-center justify-center px-8 pb-10 md:pb-0"
            >
              <div className="relative w-full max-w-[320px] aspect-square rounded-[28px] border border-white/20 bg-white/8 backdrop-blur-2xl overflow-hidden shadow-[0_28px_80px_-24px_rgba(255,42,109,.5)]">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
                  className="absolute inset-3 rounded-[22px] border border-white/18"
                  style={{ borderStyle: 'dashed' }}
                />
                <motion.div
                  animate={{ scale: [1, 1.06, 1], opacity: [0.28, 0.54, 0.28] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute inset-8 rounded-2xl"
                  style={{
                    background: 'radial-gradient(circle, rgba(255,106,0,.26) 0%, rgba(255,42,109,.2) 45%, rgba(0,225,255,.12) 100%)',
                  }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="rounded-2xl border border-white/20 bg-black/25 px-5 py-4 backdrop-blur-xl">
                    <Logo size="md" className="[&>div>span:last-child]:text-white [&>div>span:last-child]:tracking-wide" />
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SplashAnimation;
