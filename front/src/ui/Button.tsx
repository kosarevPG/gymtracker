import React from 'react';
import type { LucideIcon } from 'lucide-react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';

interface ButtonProps {
  children: React.ReactNode;
  variant?: ButtonVariant;
  className?: string;
  onClick?: () => void;
  icon?: LucideIcon;
  disabled?: boolean;
}

const variants: Record<ButtonVariant, string> = {
  primary: "bg-blue-600 text-white shadow-lg shadow-blue-900/20 hover:bg-blue-500",
  secondary: "bg-zinc-800 text-zinc-50 hover:bg-zinc-700",
  ghost: "bg-transparent text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800/50",
  danger: "bg-red-500/10 text-red-500 hover:bg-red-500/20",
  success: "bg-green-500/10 text-green-500"
};

export const Button = ({ children, variant = 'primary', className = '', onClick, icon: Icon, disabled }: ButtonProps) => (
  <button onClick={onClick} disabled={disabled} className={`flex items-center justify-center font-medium rounded-xl transition-all active:scale-95 disabled:opacity-50 ${variants[variant]} ${className}`}>
    {Icon && <Icon className="w-5 h-5 mr-2" />}
    {children}
  </button>
);
