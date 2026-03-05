import React from 'react';

interface StickyBottomBarProps {
  children: React.ReactNode;
  className?: string;
}

export const StickyBottomBar = ({ children, className = '' }: StickyBottomBarProps) => (
  <div
    className={`fixed bottom-0 left-0 w-full p-4 bg-zinc-950/80 backdrop-blur-md border-t border-zinc-800/50 z-20 ${className}`}
    style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
  >
    {children}
  </div>
);
