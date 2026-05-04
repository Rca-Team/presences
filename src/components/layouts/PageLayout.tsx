
import React, { ReactNode, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Navbar from '../Navbar';
import Footer from '../Footer';
import MobileSidebar from '../MobileSidebar';
import ContactBanner from '../ContactBanner';
import { cn } from '@/lib/utils';

interface PageLayoutProps {
  children: ReactNode;
  className?: string;
  fullWidth?: boolean;
  noFooter?: boolean;
}

const PageLayout: React.FC<PageLayoutProps> = ({ 
  children, 
  className,
  fullWidth = false,
  noFooter = false
}) => {
  const [isPageVisible, setIsPageVisible] = useState(false);
  
  useEffect(() => {
    // When component mounts, delay slightly before showing to ensure animation runs
    const timer = setTimeout(() => {
      setIsPageVisible(true);
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden">
      <Navbar />
      
      {/* Animated background orbs */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <motion.div 
          animate={{ 
            scale: [1, 1.3, 1],
            x: [0, 30, 0],
            y: [0, -20, 0]
          }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-20 left-8 w-32 md:w-64 h-32 md:h-64 rounded-full bg-ios-blue/10 blur-[80px]"
        />
        <motion.div 
          animate={{ 
            scale: [1.2, 1, 1.2],
            x: [0, -40, 0],
            y: [0, 30, 0]
          }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut", delay: 2 }}
          className="absolute bottom-20 right-8 w-40 md:w-80 h-40 md:h-80 rounded-full bg-ios-purple/10 blur-[80px]"
        />
        <motion.div 
          animate={{ 
            scale: [1, 1.4, 1],
            opacity: [0.3, 0.6, 0.3]
          }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut", delay: 4 }}
          className="absolute top-1/2 right-1/4 w-48 md:w-96 h-48 md:h-96 rounded-full bg-ios-pink/8 blur-[100px]"
        />
        <motion.div 
          animate={{ 
            scale: [1.1, 1, 1.1],
            y: [0, -50, 0]
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut", delay: 6 }}
          className="absolute bottom-1/3 left-1/3 w-36 md:w-72 h-36 md:h-72 rounded-full bg-ios-green/8 blur-[80px]"
        />
      </div>
      
      <motion.main 
        initial={{ opacity: 0, y: 30 }}
        animate={{ 
          opacity: isPageVisible ? 1 : 0, 
          y: isPageVisible ? 0 : 30 
        }}
        transition={{ 
          duration: 0.6, 
          ease: [0.34, 1.56, 0.64, 1]
        }}
        className={cn(
          "flex-1 pt-20 md:pt-28 pb-8 md:pb-12 px-4 md:px-6 lg:px-8",
          fullWidth ? "" : "max-w-7xl mx-auto w-full",
          className
        )}
      >
        {children}
      </motion.main>
      
      <ContactBanner />
      {!noFooter && <Footer />}
      <MobileSidebar />
    </div>
  );
};

export default PageLayout;