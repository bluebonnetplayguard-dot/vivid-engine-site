export default function EngineVisual({ animate = true, className = "" }) {
  return (
    <svg
      viewBox="0 0 760 560"
      className={`relative h-auto w-full drop-shadow-2xl ${className}`}
      fill="none"
      role="img"
      aria-label="Decorative engine illustration"
    >
      <defs>
        <linearGradient id="ve-metal" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#cbd5e1" />
          <stop offset="0.22" stopColor="#475569" />
          <stop offset="0.62" stopColor="#111827" />
          <stop offset="1" stopColor="#64748b" />
        </linearGradient>
        <linearGradient id="ve-darkmetal" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#334155" />
          <stop offset="1" stopColor="#0f172a" />
        </linearGradient>
        <radialGradient id="ve-energy" cx="50%" cy="50%" r="50%">
          <stop stopColor="#fed7aa" />
          <stop offset="0.3" stopColor="#f97316" />
          <stop offset="1" stopColor="#ea580c" stopOpacity="0" />
        </radialGradient>
      </defs>

      <ellipse cx="390" cy="490" rx="250" ry="34" fill="#020617" opacity="0.8" />

      {/* blueprint dimension lines */}
      <g opacity="0.55">
        <path d="M105 390H655" stroke="#38bdf8" strokeDasharray="8 12" />
        <path d="M170 445H590" stroke="#f97316" strokeDasharray="4 13" />
      </g>

      {/* flywheel */}
      <g className={animate ? "ve-flywheel" : ""} style={{ transformOrigin: "565px 300px", transformBox: "view-box" }}>
        <circle cx="565" cy="300" r="105" fill="#111827" stroke="#64748b" strokeWidth="18" />
        <circle cx="565" cy="300" r="72" fill="#020617" stroke="#334155" strokeWidth="12" />
        <circle cx="565" cy="300" r="18" fill="#94a3b8" />
        <path d="M565 202V250M663 300H615M565 398V350M467 300H515" stroke="#94a3b8" strokeWidth="14" strokeLinecap="round" />
      </g>

      {/* belt */}
      <path d="M510 226C450 170 381 168 315 205" stroke="#64748b" strokeWidth="34" strokeLinecap="round" />
      <path d="M510 226C450 170 381 168 315 205" stroke="#1e293b" strokeWidth="18" strokeLinecap="round" />

      {/* engine block */}
      <rect x="180" y="220" width="330" height="190" rx="34" fill="url(#ve-darkmetal)" stroke="#94a3b8" strokeWidth="5" />

      {/* cylinders / pistons */}
      <g className={animate ? "ve-pistons" : ""}>
        <rect x="218" y="158" width="66" height="130" rx="18" fill="url(#ve-metal)" stroke="#cbd5e1" strokeWidth="4" />
        <rect x="312" y="136" width="66" height="152" rx="18" fill="url(#ve-metal)" stroke="#cbd5e1" strokeWidth="4" />
        <rect x="406" y="158" width="66" height="130" rx="18" fill="url(#ve-metal)" stroke="#cbd5e1" strokeWidth="4" />
      </g>

      {/* side modules */}
      <rect x="155" y="310" width="84" height="80" rx="16" fill="url(#ve-metal)" stroke="#cbd5e1" strokeWidth="4" />
      <rect x="455" y="320" width="90" height="65" rx="16" fill="url(#ve-metal)" stroke="#cbd5e1" strokeWidth="4" />

      {/* pipes */}
      <path d="M208 380C157 398 126 432 114 470" stroke="#64748b" strokeWidth="28" strokeLinecap="round" />
      <path d="M484 380C518 414 541 445 548 481" stroke="#64748b" strokeWidth="28" strokeLinecap="round" />

      {/* bolts */}
      {[235, 330, 425].map((x) => (
        <g key={x}>
          <circle cx={x} cy="330" r="11" fill="#0f172a" stroke="#94a3b8" strokeWidth="4" />
          <circle cx={x} cy="370" r="11" fill="#0f172a" stroke="#94a3b8" strokeWidth="4" />
        </g>
      ))}

      {/* energy pulse */}
      <circle className={animate ? "ve-energy" : ""} cx="374" cy="300" r="135" fill="url(#ve-energy)" opacity="0.24" />
    </svg>
  );
}