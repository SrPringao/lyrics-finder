export function PlayIcon({ className = "h-3 w-3" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden className={className}>
      <path d="M4 2.5v11a.5.5 0 0 0 .76.43l9-5.5a.5.5 0 0 0 0-.86l-9-5.5A.5.5 0 0 0 4 2.5Z" />
    </svg>
  );
}

export function PauseIcon({ className = "h-3 w-3" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden className={className}>
      <rect x="3" y="2" width="3.5" height="12" rx="1" />
      <rect x="9.5" y="2" width="3.5" height="12" rx="1" />
    </svg>
  );
}

export function SpinnerIcon({ className = "h-3 w-3" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className={`animate-spin ${className}`}>
      <path d="M8 2a6 6 0 1 0 6 6" strokeLinecap="round" />
    </svg>
  );
}
