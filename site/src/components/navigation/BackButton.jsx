import { ChevronLeft } from 'lucide-react';
import { useSmartBack } from '@/components/navigation/useSmartBack';

export default function BackButton({ fallback, label = 'Back', className = '' }) {
  const { goBack } = useSmartBack(fallback);
  return <button type="button" onClick={goBack} aria-label={label === 'Back' ? 'Go back' : `Back to ${label}`} className={`-ml-2 inline-flex h-11 min-w-11 items-center gap-0.5 rounded-full pl-1 pr-3 text-primary active:opacity-60 transition-opacity select-none focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring ${className}`}>
    <ChevronLeft className="h-6 w-6 shrink-0" strokeWidth={2.25} aria-hidden="true" />
    <span className="text-base font-medium">{label}</span>
  </button>;
}