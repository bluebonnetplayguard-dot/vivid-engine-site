const METRICS = [
  { label: "ESTIMATES BUILT", value: "1,240+", detail: "Project-ready proposals", tone: "blue", pos: "-left-6 top-[14%]", depth: 0.35, float: "metric-float-1" },
  { label: "FIELD NOTES LOGGED", value: "8,500+", detail: "Photos, notes, reports", tone: "orange", pos: "-right-4 top-[6%]", depth: 0.45, float: "metric-float-2" },
  { label: "JOBS ORGANIZED", value: "340+", detail: "From bid to closeout", tone: "slate", pos: "-right-3 bottom-[8%]", depth: 0.3, float: "metric-float-3" },
  { label: "CREW READY", value: "MOBILE + DESKTOP", detail: "Built for the field", tone: "green", pos: "left-[6%] bottom-[2%]", depth: 0.4, float: "metric-float-4" },
];

const TONES = {
  blue: { border: "border-blue-400/35", label: "text-blue-300", dot: "bg-blue-400" },
  orange: { border: "border-orange-400/35", label: "text-orange-300", dot: "bg-orange-400" },
  green: { border: "border-emerald-400/35", label: "text-emerald-300", dot: "bg-emerald-400" },
  slate: { border: "border-slate-400/35", label: "text-slate-300", dot: "bg-slate-300" },
};

export default function FloatingMetrics({ allowMotion }) {
  return (
    <>
      {/* Desktop floating cards */}
      {METRICS.map((m) => {
        const t = TONES[m.tone];
        return (
          <div key={m.label} className={`pointer-events-none absolute z-20 hidden min-w-[150px] lg:block ${m.pos}`}>
            <div
              className="metric-parallax"
              style={{
                transform: `translate(calc(var(--engine-x) * ${m.depth}), calc(var(--engine-y) * ${m.depth}))`,
                transition: "transform 220ms ease-out",
              }}
            >
              <div className={`rounded-xl border ${t.border} bg-slate-950/85 p-3 shadow-xl backdrop-blur-md ${allowMotion ? m.float : ""}`}>
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${t.dot} shadow-[0_0_12px_currentColor]`} />
                  <p className={`text-[10px] font-black tracking-[0.14em] ${t.label}`}>{m.label}</p>
                </div>
                <p className="mt-2 text-xl font-black tracking-tight text-white">{m.value}</p>
                <p className="mt-1 text-xs text-slate-400">{m.detail}</p>
              </div>
            </div>
          </div>
        );
      })}

      {/* Mobile grid */}
      <div className="mt-6 grid grid-cols-2 gap-3 lg:hidden">
        {METRICS.map((m) => {
          const t = TONES[m.tone];
          return (
            <article key={m.label} className="rounded-xl border border-slate-700 bg-slate-950/90 p-3 shadow-lg">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${t.dot}`} />
                <p className="text-[9px] font-black tracking-[0.12em] text-slate-400">{m.label}</p>
              </div>
              <p className="mt-2 text-base font-black leading-tight text-white">{m.value}</p>
              <p className="mt-1 text-xs leading-4 text-slate-500">{m.detail}</p>
            </article>
          );
        })}
      </div>
    </>
  );
}