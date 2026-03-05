import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  className?: string;
  leftIcon?: React.ReactNode;
  rightAddon?: string;
  error?: boolean;
  label?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', leftIcon, rightAddon, error, label, ...props }, ref) => {
    const baseInputClass = `w-full min-h-[48px] bg-zinc-900 text-zinc-50 rounded-xl px-4 focus:outline-none focus:ring-1 transition-all ${className}`;
    const ringClass = error ? 'focus:ring-red-500 border border-red-500/50' : 'focus:ring-zinc-600';
    const plClass = leftIcon ? 'pl-10' : '';
    const prClass = rightAddon ? 'pr-12' : '';

    const inputEl = (
      <div className="relative w-full">
        {leftIcon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none">
            {leftIcon}
          </div>
        )}
        <input
          ref={ref}
          {...props}
          className={`${baseInputClass} ${ringClass} ${plClass} ${prClass} placeholder:text-zinc-600`}
        />
        {rightAddon && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm pointer-events-none">
            {rightAddon}
          </span>
        )}
      </div>
    );

    if (label) {
      return (
        <div className="w-full">
          <label className="text-sm text-zinc-400 mb-1 block">{label}</label>
          {inputEl}
        </div>
      );
    }

    return inputEl;
  }
);
Input.displayName = 'Input';
