import { motion } from "framer-motion";
import { Link } from 'react-router-dom';
import { PageMeta, PAGE_META } from '@/components/SeoSchema';

export default function Privacy() {
  return (
    <div className="min-h-screen bg-[#0A0C12] text-[#F3F2F8]" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PageMeta {...PAGE_META.privacy} />
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
              className="text-[29px] md:text-[38px] font-semibold tracking-tight max-w-[480px]"
              style={{
                background: "linear-gradient(135deg, #FFFFFF 30%, #C9C4F5 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Privacy Policy
            </h1>
            <p className="text-sm text-[#2FD9C4] mt-3.5">Effective September 3, 2026</p>
          </motion.div>
        </header>
      </div>

      <main className="max-w-[640px] mx-auto px-6 py-14 md:py-24 space-y-6">
        <Section title="Overview">
          <p>
            Vivid Engine Solutions ("we," "us," "our") is a d/b/a of Bluebonnet Playguard, LLC. We build websites, apps, and business tools for clients across
            Southeast Texas and Southwest Louisiana. This policy explains what information we collect through
            vividenginesolutions.com, how we use it, and your choices.
          </p>
        </Section>

        <Section title="Information we collect">
          <ul className="list-disc pl-5 space-y-2 mb-3.5">
            <li>
              <strong>Inquiry information:</strong> name, email address, and phone number when you fill out a contact
              form or chat with our AI assistant on the site.
            </li>
            <li>
              <strong>Chat conversations:</strong> messages you send our AI assistant, which may be reviewed by our
              team to follow up on your inquiry. Our team can also join a conversation directly.
            </li>
            <li>
              <strong>Site usage information:</strong> basic technical information like browser type and pages visited,
              used to keep the site running smoothly.
            </li>
          </ul>
          <p>
            If we run advertising campaigns (for example, Google Ads) to promote our own services, we may use standard
            tracking pixels or cookies to measure ad performance. We do not sell visitor information to third parties.
          </p>
        </Section>

        <Section title="How we use your information">
          <ul className="list-disc pl-5 space-y-2">
            <li>To respond to your inquiry and follow up about a potential project</li>
            <li>
              To provide services you've engaged us for, such as site builds, maintenance, or a CRM/POS system
            </li>
            <li>To improve our website and services</li>
          </ul>
        </Section>

        <Section title="Client systems (CRM, POS, and custom builds)">
          <p>
            For clients using our custom CRM, POS, or website builds, data you or your customers enter into those
            systems (such as client records, inventory, or calendar events) belongs to you and is used solely to
            operate the tools we've built for your business. We do not access or use this data for our own purposes
            beyond providing support and maintenance.
          </p>
        </Section>

        <Section title="Vivid AI Search">
          <p>We record how many questions you ask to apply your plan's limits. Whether your conversations are saved depends on your plan, as described under Saved conversation history below.</p>
          <p>To answer, your question is sent to Anthropic (Claude), which may search the web. On paid plans the question is also sent to the other AI engines listed on your plan (Perplexity, Google Gemini and OpenAI ChatGPT) for a second opinion. Avoid entering passwords, payment details or other sensitive personal information in questions. Payments for paid plans are processed by Square.</p>
        </Section>

        <Section title="Saved conversation history">
          <ul className="list-disc pl-5 space-y-2 mb-3.5">
            <li><strong>Who gets it:</strong> saved history is included with paid plans (Search Pro, Search Max, paid Website and App Builder plans, and bundles). On the free plan, or without an account, a conversation works while it is open but is not kept after the session ends.</li>
            <li><strong>What we store:</strong> your questions, the answers, the sources shown, the conversation title, and any pins, favorites or Spaces you set.</li>
            <li><strong>How long:</strong> Search Pro and paid Website and App Builder plans keep conversations for 12 months. Search Max and the All-In-One bundle keep them until you delete them. You can set conversations to delete automatically after 30 days, 90 days or 12 months, or never where your plan allows.</li>
            <li><strong>Who can see it:</strong> only you, and anyone you share a conversation link with. Conversations are stored encrypted and tied to your account. They are sent to AI providers only as context for that same conversation. We do not use them to advertise to you.</li>
            <li><strong>Private mode:</strong> conversations started in private mode are never saved, even on a paid plan.</li>
            <li><strong>Deleting:</strong> you can delete one conversation or all of your history at any time from History. Deleted conversations are removed from our systems, except where we must keep records by law.</li>
            <li><strong>If your plan ends:</strong> your history becomes read-only for 30 days. We email you a link to export it. After 30 days it is deleted. If you upgrade again within 30 days, everything is restored.</li>
            <li><strong>Memory (Search Max):</strong> if you turn on memory, the AI remembers preferences you share across conversations. You can turn it off or clear it at any time.</li>
          </ul>
        </Section>

        <Section title="Vivid Video Studio">
          <p>Videos are edited and exported in your own browser. The video, photo and music files you add stay on your device and are not uploaded to us. We store your projects’ edit settings (titles, text, timing and effects), small preview images, and any brand kits you save, so you can reopen them from your account, and we count exports and AI use to apply your plan’s limits. You can delete a project at any time.</p>
          <p>When you use AI features, the needed content is sent to the provider that does the work: the sound of your video to OpenAI to make captions, the narration text to OpenAI to make an AI voiceover, and the text you paste for script-to-video to Anthropic (Claude) or OpenAI. Stock footage searches go to Pexels, and downloads of Pexels files pass through our server so your browser can edit them. Don’t use AI features on recordings of people who have not agreed to it. Payments for paid plans are processed by Square.</p>
        </Section>

        <Section title="Data storage and security">
          <p>
            Information is stored on secure servers used to operate our website and client systems. We take reasonable
            technical and organizational measures to protect your information, but no method of storage or transmission
            is completely secure.
          </p>
        </Section>

        <Section title="Your choices">
          <ul className="list-disc pl-5 space-y-2">
            <li>You can ask us to correct or delete your inquiry information at any time.</li>
            <li>You can opt out of further contact by replying to any of our messages or emailing us directly.</li>
          </ul>
        </Section>

        <Section title="Text messages (SMS)">
          <p>If you opt in, we use your phone number to send service-related messages, appointment updates and replies to your inquiries. Message frequency varies. Message and data rates may apply.</p>
          <p>Reply STOP to opt out or HELP for help. Consent to SMS is not required to purchase services. Mobile numbers and SMS consent are not sold or shared with third parties for their marketing; messaging providers may process them only to deliver our messages.</p>
        </Section>

        <Section title="Account deletion">
          <p>You can request deletion without reinstalling the app on our <Link to="/delete-account" className="underline">Delete account page</Link>. Sign in there, or use its email option if you cannot access your account. We verify your identity and process requests within 30 days, subject to legal obligations.</p>
          <p>Deletion includes your account, profile and associated personal data. Invoices, payment records and signed agreements may be retained only for applicable tax, accounting and legal requirements. Retention varies by record and law; we explain exceptions when processing your request and delete records when retention is no longer required.</p>
        </Section>

        <Section title="Children's privacy">
          <p>Our services are intended for business owners and adults. We do not knowingly collect information from anyone under 13.</p>
        </Section>

        <Section title="Changes to this policy">
          <p>If we make material changes to this policy, we'll update the effective date above.</p>
        </Section>

        <Section title="Contact us">
          <p>
            Questions about this policy or your data? Email us at{" "}
            <a href="mailto:support@vividenginesolutions.com" className="text-[#2FD9C4]">
              support@vividenginesolutions.com
            </a>
            .
          </p>
        </Section>
      </main>

      <footer className="max-w-[640px] mx-auto px-6 pb-16 text-[13px] text-[#9C9AB0]">
        <p>
          © 2026 Vivid Engine Solutions. Vivid Engine Solutions is a d/b/a of Bluebonnet Playguard, LLC.{" "}
          <a href="https://vividenginesolutions.com" className="text-[#9C9AB0]">
            vividenginesolutions.com
          </a>
        </p>
      </footer>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="bg-white/4.5 border border-white/10 rounded-2xl p-6 md:p-8 backdrop-blur-md">
      <h2 className="text-[18px] font-semibold mb-4 tracking-tight">{title}</h2>
      <div className="text-[14.5px] text-[#9C9AB0] space-y-3.5 max-w-[560px] [&>ul]:mb-3.5 [&>p:last-child]:mb-0 [&>ul:last-child]:mb-0">
        {children}
      </div>
    </section>
  );
}