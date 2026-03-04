import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export const Card = ({ children, className = '', onClick }: CardProps) => (
  <div onClick={onClick} className={`bg-zinc-900 border border-zinc-800 rounded-2xl ${className}`}>
    {children}
  </div>
);
