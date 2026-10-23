import { motion, useReducedMotion } from "framer-motion";

const TRADES = [
  "Electrical", "Mechanical", "HVAC", "Plumbing", "Pipefitting", "Welding",
  "Engine Service", "Facility Maintenance", "General Construction",
];

export default function LandingTrades() {
  const reduce = useReducedMotion();
  return (
    <section id="industries" className="relative border-t border-slate-800 bg-[#0a0f18] py-24">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <p className="text-xs font-black tracking-[0.26em] text-orange-300">INDUSTRIES</p>
        <h2 className="mt-4 max-w-3xl text-3xl font-black tracking-tight text-white sm:text-4xl lg:text-5xl">
          Made for crews who build, repair, install, and maintain.
        </h2>
        <div className="mt-10 flex flex-wrap gap-3">
          {TRADES.map((t, i) => (
            <motion.span
              key={t}
              initial={reduce ? false : { opacity: 0, scale: 0.9 }}
              whileInView={reduce ? undefined : { opacity: 1, scale: 1 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.35, delay: i * 0.04 }}
              className="rounded-full border border-slate-700 bg-slate-900/60 px-5 py-2.5 text-sm font-bold text-slate-200 transition hover:border-blue-500 hover:text-white"
            >
              {t}
            </motion.span>
          ))}
        </div>
      </div>
    </section>
  );
}