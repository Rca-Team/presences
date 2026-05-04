
import React from 'react';
import { Link } from 'react-router-dom';
import Logo from './Logo';

const Footer = () => {
  return (
    <footer className="py-12 px-6 border-t border-border bg-secondary/50">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8">
        <div className="space-y-4">
          <Logo />
          <p className="text-sm text-muted-foreground max-w-xs">
            Streamline attendance management with advanced facial recognition technology.
          </p>
        </div>
        
        <div>
          <h4 className="font-medium text-sm mb-4">Product</h4>
          <ul className="space-y-2">
            {['Features', 'Security', 'Pricing', 'Documentation'].map((item) => (
              <li key={item}>
                <Link to="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  {item}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        
        <div>
          <h4 className="font-medium text-sm mb-4">Company</h4>
          <ul className="space-y-2">
            {['About', 'Careers', 'Blog', 'Contact'].map((item) => (
              <li key={item}>
                <Link to="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  {item}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        
        <div>
          <h4 className="font-medium text-sm mb-4">Legal</h4>
          <ul className="space-y-2">
            {['Terms', 'Privacy', 'Cookies', 'Licenses'].map((item) => (
              <li key={item}>
                <Link to="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  {item}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
      
      <div className="max-w-7xl mx-auto mt-12 pt-6 border-t border-border flex flex-col md:flex-row justify-between items-center">
        <p className="text-sm text-muted-foreground">
          © {new Date().getFullYear()} Presence. All rights reserved. <span className="font-medium">Made by Gaurav</span>
        </p>
        <div className="flex space-x-4 mt-4 md:mt-0">
          {['Twitter', 'LinkedIn', 'GitHub'].map((item) => (
            <Link key={item} to="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              {item}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
};

export default Footer;
