import { motion, useReducedMotion } from "framer-motion";
import { Calculator, ClipboardList, Sigma, FileImage, Wrench, ShieldCheck } from "lucide-react";

const FEATURES = [
  { icon: Calculator, title: "Estimate Faster", desc: "Create detailed estimates, labor budgets, material lists, proposals, and change orders." },
  { icon: ClipboardList, title: "Run the Field", desc: "Track daily reports, crew hours, jobsite notes, photos, material needs, and progress." },
  { icon: Sigma, title: "Master the Math", desc: "Use conduit bend cards, fitting takeout references, pipe and field calculators, and saved project calculations." },
  { icon: FileImage, title: "See the Work", desc: "Upload drawings, create takeoffs, organize documents, and review AI-assisted draft findings." },
  { icon: Wrench, title: "Maintain Equipment", desc: "Track inspections, service intervals, equipment history, engine repairs, and downtime." },
  { icon: ShieldCheck, title: "Stay Accountable", desc: "Keep RFIs, safety notes, quality checks, approvals, and project history organized." },
];

export default function LandingFeatures() {
  const reduce = useReducedMotion();
  return (
    <section id="features" className="relative border-t border-slate-800 bg-[#070b12] py-24">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <div className="max-w-2xl">
          <p className="text-xs font-black tracking-[0.26em] text-blue-300">FEATURES</p>
          <h2 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl lg:text-5xl">
            One platform. Built for the real job.
          </h2>
        </div>
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={reduce ? false : { opacity: 0, y: 24 }}
              whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.5, delay: (i % 3) * 0.08 }}
              className="group rounded-2xl border border-slate-800 bg-slate-900/50 p-6 transition hover:border-blue-500/50 hover:bg-slate-900"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-700 bg-slate-950 text-blue-400 transition group-hover:border-blue-500 group-hover:text-orange-400">
                <f.icon className="h-6 w-6" />
              </div>
              <h3 className="mt-5 text-lg font-bold text-white">{f.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">{f.desc}</p>
            </motion.div>
          ))}
        </div>
        <div className="mt-12 text-center">
          <a
            href="https://app.vividenginesolutions.com"
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-blue-600 px-7 text-base font-black text-white shadow-lg shadow-blue-950/50 transition hover:bg-blue-500 focus:outline-hidden focus:ring-4 focus:ring-blue-300"
          >
            Start Building Better Jobs
          </a>
        </div>
      </div>
    </section>
  );
}