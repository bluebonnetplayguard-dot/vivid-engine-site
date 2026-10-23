export default function RouteLoading() {
  return <div className="flex min-h-screen items-center justify-center bg-background" role="status" aria-live="polite">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-800" aria-hidden="true" />
    <span className="sr-only">Loading page…</span>
  </div>;
}