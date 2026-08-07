import React from 'react';

interface ArcLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'full' | 'badge' | 'header' | 'gold';
  className?: string;
}

export const ArcLogo: React.FC<ArcLogoProps> = ({
  size = 'md',
  variant = 'full',
  className = ''
}) => {
  const sizeClasses = {
    sm: 'h-8',
    md: 'h-11',
    lg: 'h-16',
    xl: 'h-24'
  }[size];

  if (variant === 'badge') {
    return (
      <div className={`inline-flex items-center space-x-2 bg-slate-950 text-amber-400 p-2 rounded-lg border border-amber-500/40 shadow-sm ${className}`}>
        <svg className="w-6 h-6 text-amber-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L3 7v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-5.45 9-12V7l-9-5z" fill="rgba(245, 158, 11, 0.15)" />
          <path d="M12 6v12M8 10l8 0M6 13l4-2M18 13l-4-2" />
          <circle cx="12" cy="18" r="1.5" fill="currentColor" />
        </svg>
        <div className="flex flex-col leading-none">
          <span className="font-extrabold text-xs tracking-wider text-amber-300 uppercase">ARC</span>
          <span className="text-[9px] text-slate-300 font-semibold tracking-tight">INVESTIGATIONS</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center space-x-3.5 ${className}`}>
      {/* Emblem SVG Icon */}
      <div className="relative shrink-0 flex items-center justify-center p-2 rounded-xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border border-amber-500/40 shadow-md">
        <svg className="w-8 h-8 text-amber-400" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Outer Shield */}
          <path d="M32 4L8 14V30C8 46.5 21.8 58 32 61C42.2 58 56 46.5 56 30V14L32 4Z" fill="#090d16" stroke="#f59e0b" strokeWidth="2.5" />
          {/* Inner Decorative Lines */}
          <path d="M32 9L13 17V30C13 43 23.5 52.5 32 55C40.5 52.5 51 43 51 30V17L32 9Z" stroke="#d97706" strokeWidth="1" strokeDasharray="2 2" opacity="0.6" />
          {/* Scales of Justice Balance */}
          <path d="M32 16V44" stroke="#fef3c7" strokeWidth="3" strokeLinecap="round" />
          <path d="M20 23H44" stroke="#fef3c7" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M20 23L13 34H27L20 23Z" fill="url(#goldGrad)" opacity="0.85" />
          <path d="M44 23L37 34H51L44 23Z" fill="url(#goldGrad)" opacity="0.85" />
          <path d="M12 34C12 37.5 15.5 39 20 39C24.5 39 28 37.5 28 34" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
          <path d="M36 34C36 37.5 39.5 39 44 39C48.5 39 52 37.5 52 34" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
          <circle cx="32" cy="45" r="3" fill="#f59e0b" />
          <defs>
            <linearGradient id="goldGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#fef3c7" />
              <stop offset="50%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#b45309" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* Typography */}
      <div className="flex flex-col justify-center">
        <div className="flex items-center space-x-2">
          <span className="font-black text-xl tracking-wider text-white font-sans bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-yellow-500">
            ARC
          </span>
          <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-md tracking-wider">
            INVESTIGATIONS
          </span>
        </div>
        <span className="text-[11px] font-semibold text-slate-300 tracking-wide">
          &amp; CONSULTING • DEFENSE ANALYSIS
        </span>
      </div>
    </div>
  );
};
