import BackButton from '@/components/navigation/BackButton';

export default function MobilePageHeader({ title, backLabel = 'Back', fallback, actions, className = '' }) {
  return <header className={`md:hidden sticky top-0 z-40 border-b border-border/60 bg-background/90 backdrop-blur-md ${className}`} style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
    <div className="relative flex h-12 items-center justify-between" style={{ paddingLeft: 'max(12px, env(safe-area-inset-left, 0px))', paddingRight: 'max(12px, env(safe-area-inset-right, 0px))' }}>
      <BackButton label={backLabel} fallback={fallback} />
      {title && <h2 className="pointer-events-none absolute inset-x-24 truncate text-center text-[17px] font-semibold">{title}</h2>}
      <div className="flex min-w-11 items-center justify-end gap-1">{actions}</div>
    </div>
  </header>;
}