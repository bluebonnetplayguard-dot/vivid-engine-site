import { motion } from "framer-motion";
import { PLANS, formatUsd } from '@/config/pricing';
import { PageMeta, PAGE_META } from '@/components/SeoSchema';

const FAQS = [
  {
    q: "How long does a website or app build take?",
    a: "Timelines depend on scope, but most launch builds are ready within a few weeks of our initial sit-down and content collection.",
  },
  {
    q: "What's included in Launch?",
    a: `Launch is a one-time ${formatUsd(PLANS.find(plan => plan.id === 'launch').price)} build: up to 10 pages, everything in Starter, a blog or news page, photo gallery, and inquiries by text and email. Monthly care is separate. Starter begins at $999 for up to 5 pages.`,
  },
  {
    q: "Do you offer maintenance after my site goes live?",
    a: "Yes. Basic Care ($49/mo) includes hosting, SSL, security, daily backups and monitoring. Turnkey Care ($99/mo) adds a domain, site assistant, up to one hour of monthly edits, a monthly report and priority support.",
  },
  {
    q: "Can you build a CRM or POS system into my site?",
    a: "Yes — we offer custom CRM systems with calendar integration and POS systems built on Square for clients who need them.",
  },
  {
    q: "Does my site come with an AI assistant?",
    a: "We can add a chat assistant to greet your visitors and collect their name, email, and phone number. You can jump into any conversation yourself at any time.",
  },
  {
    q: "Do you serve areas outside Southeast Texas and Southwest Louisiana?",
    a: "Our focus is SETX and SWLA, but reach out and we're happy to talk about your project regardless of location.",
  },
  {
    q: "I need a change made to my live site — what do I do?",
    a: "Email us at support@vividenginesolutions.com with what you'd like updated, and we'll take it from there.",
  },
];

export default function Support() {
  return (
    <div className="min-h-screen bg-[#0A0C12] text-[#F3F2F8]" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PageMeta {...PAGE_META.support} />
      <div
        className="relative overflow-hidden border-b border-white/10"
        style={{
          background:
            "radial-gradient(600px 300px at 20% -10%, rgba(139,124,246,0.25), transparent 60%), radial-gradient(500px 260px at 90% 0%, rgba(47,217,196,0.15), transparent 55%), #171226",
        }}
      >
        <header className="px-6 py-16 md:py-24">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="max-w-[640px] mx-auto"
          >
            <p className="inline-flex items-center gap-2 text-sm text-[#2FD9C4] mb-5">
              <span
                className="w-[7px] h-[7px] rounded-full"
                style={{ background: "linear-gradient(135deg, #8B7CF6, #2FD9C4)" }}
              />
              Vivid Engine Solutions
            </p>
            <h1
              className="text-[29px] md:text-[38px] font-semibold leading-tight tracking-tight max-w-[480px]"
              style={{
                background: "linear-gradient(135deg, #FFFFFF 30%, #C9C4F5 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Support for your website, app, and client tools.
            </h1>
            <p className="text-base text-[#9C9AB0] max-w-[440px] mt-3.5">
              Help with your build, your live site, or the systems we've set up for you — CRM, POS, and more.
            </p>
          </motion.div>
        </header>
      </div>

      <main className="max-w-[640px] mx-auto px-6 py-14 md:py-24">
        <section className="bg-white/4.5 border border-white/10 rounded-2xl p-6 md:p-8 backdrop-blur-md">
          <h2 className="text-[19px] font-semibold mb-4 tracking-tight">Contact us</h2>
          <p className="text-[14.5px] text-[#9C9AB0] mb-5 max-w-[540px]">
            We work with clients across SETX and SWLA and offer in-person sit-downs as well as calls.
          </p>
          <div className="flex flex-wrap gap-7">
            <div className="flex-1 min-w-[200px]">
              <p className="text-xs text-[#9C9AB0] mb-1.5">Email</p>
              <p>
                <a
                  href="mailto:support@vividenginesolutions.com"
                  className="text-[#2FD9C4] text-base border-b border-transparent hover:border-[#2FD9C4] transition-colors"
                >
                  support@vividenginesolutions.com
                </a>
              </p>
            </div>
            <div className="flex-1 min-w-[200px]">
              <p className="text-xs text-[#9C9AB0] mb-1.5">Website</p>
              <p>
                <a
                  href="https://vividenginesolutions.com"
                  className="text-[#2FD9C4] text-base border-b border-transparent hover:border-[#2FD9C4] transition-colors"
                >
                  vividenginesolutions.com
                </a>
              </p>
            </div>
          </div>
        </section>

        <section className="bg-white/4.5 border border-white/10 rounded-2xl p-6 md:p-8 backdrop-blur-md mt-6">
          <h2 className="text-[19px] font-semibold mb-4 tracking-tight">Common questions</h2>
          <div className="divide-y divide-white/10">
            {FAQS.map((item) => (
              <div key={item.q} className="py-4 first:pt-0 last:pb-0">
                <p className="text-[15px] font-semibold mb-2">{item.q}</p>
                <p className="text-[14.5px] text-[#9C9AB0] max-w-[540px]">{item.a}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="max-w-[640px] mx-auto px-6 pb-16 text-[13px] text-[#9C9AB0]">
        <p>
          © 2026 Vivid Engine Solutions.{" "}
          <a href="https://vividenginesolutions.com" className="text-[#9C9AB0]">
            vividenginesolutions.com
          </a>
        </p>
      </footer>
    </div>
  );
}