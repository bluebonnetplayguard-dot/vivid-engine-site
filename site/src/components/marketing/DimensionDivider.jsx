export default function DimensionDivider({ label, meta }) {
  return (
    <div className="flex items-center gap-3 py-6">
      <span className="h-3 w-px bg-foreground/50" />
      <span className="h-px flex-1 bg-foreground/25" />
      <span className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">{label}</span>
      <span className="h-px flex-1 bg-foreground/25" />
      <span className="h-3 w-px bg-foreground/50" />
      {meta && <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60">{meta}</span>}
    </div>
  );
}