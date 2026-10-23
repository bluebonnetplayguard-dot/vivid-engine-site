import { useEffect, useRef, useState } from "react";
import EngineVisual from "./EngineVisual";
import FloatingMetrics from "./FloatingMetrics";

const PARTICLES = [
  { left: "12%", top: "30%", size: 3, delay: "0s", dur: "particle-a", opacity: 0.5 },
  { left: "82%", top: "22%", size: 2, delay: "1.4s", dur: "particle-b", opacity: 0.4 },
  { left: "68%", top: "68%", size: 4, delay: "0.8s", dur: "particle-c", opacity: 0.45 },
  { left: "24%", top: "72%", size: 2, delay: "2.1s", dur: "particle-a", opacity: 0.35 },
  { left: "90%", top: "50%", size: 3, delay: "1.1s", dur: "particle-b", opacity: 0.4 },
  { left: "40%", top: "18%", size: 2, delay: "0.4s", dur: "particle-c", opacity: 0.3 },
  { left: "55%", top: "82%", size: 3, delay: "1.8s", dur: "particle-a", opacity: 0.35 },
];

export default function EngineHero() {
  const heroRef = useRef(null);
  const visualRef = useRef(null);
  const gridRef = useRef(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [motionEnabled, setMotionEnabled] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  const allowMotion = motionEnabled && !reducedMotion;

  // Scroll: fade visual + drift grid (no scroll-jacking)
  useEffect(() => {
    if (!allowMotion) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const hero = heroRef.current;
        if (!hero) return;
        const h = hero.offsetHeight;
        const y = window.scrollY;
        const progress = Math.min(y / (h * 0.6), 1);
        if (visualRef.current) visualRef.current.style.opacity = String(Math.max(0.2, 1 - progress));
        if (gridRef.current) gridRef.current.style.transform = `translate3d(var(--grid-x), ${y * 0.12}px, 0)`;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [allowMotion]);

  const onPointerMove = (e) => {
    if (!allowMotion || !heroRef.current) return;
    const b = heroRef.current.getBoundingClientRect();
    const x = (e.clientX - b.left) / b.width - 0.5;
    const y = (e.clientY - b.top) / b.height - 0.5;
    const el = heroRef.current;
    el.style.setProperty("--engine-x", `${x * -8}px`);
    el.style.setProperty("--engine-y", `${y * -6}px`);
    el.style.setProperty("--grid-x", `${x * -5}px`);
    el.style.setProperty("--grid-y", `${y * -4}px`);
  };

  const onPointerLeave = () => {
    if (!heroRef.current) return;
    ["--engine-x", "--engine-y", "--grid-x", "--grid-y"].forEach((v) =>
      heroRef.current.style.setProperty(v, "0px")
    );
  };

  return (
    <section
      ref={heroRef}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      className="relative isolate flex min-h-screen items-center overflow-hidden bg-[#070b12] pt-20 text-white"
      style={{ "--engine-x": "0px", "--engine-y": "0px", "--grid-x": "0px", "--grid-y": "0px" }}
    >
      {/* industrial grid */}
      <div
        ref={gridRef}
        aria-hidden="true"
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(rgba(96,165,250,0.10) 1px, transparent 1px), linear-gradient(90deg, rgba(96,165,250,0.10) 1px, transparent 1px)",
          backgroundSize: "52px 52px",
          transform: "translate(var(--grid-x), var(--grid-y))",
          transition: "transform 220ms ease-out",
        }}
      />

      {/* glow + vignette */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(circle_at_72%_40%,rgba(37,99,235,0.22),transparent_28%),radial-gradient(circle_at_82%_70%,rgba(249,115,22,0.16),transparent_25%),linear-gradient(180deg,rgba(15,23,42,0.10),rgba(2,6,23,0.94))]"
      />

      {/* drifting particles */}
      {allowMotion && (
        <div aria-hidden="true" className="absolute inset-0">
          {PARTICLES.map((p, i) => (
            <span
              key={i}
              className={`absolute rounded-full bg-sky-300 ${p.dur}`}
              style={{ left: p.left, top: p.top, width: p.size, height: p.size, opacity: p.opacity, animationDelay: p.delay }}
            />
          ))}
        </div>
      )}

      <div className="relative mx-auto grid w-full max-w-7xl items-center gap-10 px-5 py-16 lg:grid-cols-2 lg:px-8">
        {/* Copy panel */}
        <div className="z-10 max-w-2xl">
          <p className="text-xs font-black tracking-[0.26em] text-blue-300">VIVID ENGINE SOLUTIONS</p>
          <h1 className="mt-5 text-5xl font-black leading-[0.95] tracking-tight sm:text-6xl lg:text-7xl">
            Powering Better{" "}
            <span className="block bg-linear-to-r from-blue-300 via-sky-400 to-orange-400 bg-clip-text text-transparent">
              Work in the Field.
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">
            Estimate jobs, document progress, manage equipment, and keep project decisions moving—from the shop to the jobsite.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href="https://app.vividenginesolutions.com"
              className="inline-flex min-h-14 items-center justify-center rounded-xl bg-blue-600 px-6 text-base font-black text-white shadow-lg shadow-blue-950/50 transition hover:bg-blue-500 focus:outline-hidden focus:ring-4 focus:ring-blue-300"
            >
              Open Vivid Estimator
            </a>
            <a
              href="#features"
              className="inline-flex min-h-14 items-center justify-center rounded-xl border border-slate-600 bg-slate-900/70 px-6 text-base font-bold text-slate-100 transition hover:border-blue-400 hover:bg-slate-800 focus:outline-hidden focus:ring-4 focus:ring-blue-300"
            >
              Explore Features
            </a>
          </div>
          <p className="mt-6 text-[11px] font-black tracking-[0.22em] text-slate-500">
            BUILT FOR THE WORK THAT KEEPS AMERICA MOVING
          </p>
          <button
            type="button"
            onClick={() => setMotionEnabled((e) => !e)}
            className="mt-5 text-sm font-semibold text-slate-400 underline decoration-slate-600 underline-offset-4 hover:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-400 rounded"
          >
            {allowMotion ? "Reduce motion" : "Enable motion"}
          </button>
        </div>

        {/* Engine visual */}
        <div ref={visualRef} className="relative" style={{ transition: "opacity 300ms ease-out" }}>
          <div
            className={allowMotion ? "engine-float" : ""}
            style={{
              transform: "translate(var(--engine-x), var(--engine-y)) perspective(1000px) rotateX(4deg) rotateY(-7deg)",
              transition: "transform 220ms ease-out",
            }}
          >
            <div className="absolute inset-12 rounded-full bg-blue-500/15 blur-3xl" />
            <div className="absolute bottom-8 right-10 h-40 w-40 rounded-full bg-orange-500/15 blur-3xl" />
            <EngineVisual animate={allowMotion} />
          </div>
          <FloatingMetrics allowMotion={allowMotion} />
        </div>
      </div>

      {/* scroll cue */}
      <div aria-hidden="true" className="absolute bottom-6 left-1/2 -translate-x-1/2 text-slate-500">
        <div className="flex h-9 w-5 items-start justify-center rounded-full border border-slate-600 p-1">
          <div className={allowMotion ? "h-2 w-1 animate-bounce rounded-full bg-blue-400" : "h-2 w-1 rounded-full bg-blue-400"} />
        </div>
      </div>
    </section>
  );
}