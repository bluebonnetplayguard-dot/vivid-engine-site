import { useState } from 'react';
import { BookOpen, Telescope, FileSearch, Mic, Code, Clapperboard, Briefcase, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import SEO from '@/components/seo/SEO';
import AppShell from '@/components/shell/AppShell';
import HomeSearch from '@/components/home/HomeSearch';
import useAskThread from '@/components/home/useAskThread';
import useSearchAccount from '@/hooks/useSearchAccount';
import EngineServices from '@/components/engine/EngineServices';
import EngineWork from '@/components/engine/EngineWork';
import EngineProcess from '@/components/engine/EngineProcess';
import EnginePricing from '@/components/engine/EnginePricing';
import EngineInquiry from '@/components/engine/EngineInquiry';
import PaymentOptions from '@/components/payments/PaymentOptions';
import '@/components/engine/engine.css';

const SEARCH_FEATURES = [
  [BookOpen, 'Answers with sources', 'Live web results with numbered citations you can open.'],
  [Telescope, 'Deep research', 'Ask follow-ups in the same thread and go as deep as you need.'],
  [FileSearch, 'Any topic', 'Homework, home repair, shopping, local help or business questions.'],
  [Mic, 'Voice', 'Ask out loud on phones and browsers that support it.'],
];
const BUILD_FEATURES = [
  [Code, 'Websites & apps', 'Turn an answer into a site or app plan, then have us build it.', '/start'],
  [Clapperboard, 'Video Studio', 'Promo clips and social video from a prompt.', '/video'],
  [Briefcase, 'Business help', 'Pricing, marketing and Google listings, explained.', '/services'],
  [Users, 'Built for you', 'Prefer a person? Our local team builds and maintains it.', '/#inquiry'],
];

export default function Home() {
  const [selection, setSelection] = useState({ name: '', revision: 0 });
  const account = useSearchAccount();
  const t = useAskThread(account);
  const selectPlan = name => {
    setSelection(previous => ({ name, revision: previous.revision + 1 }));
    document.getElementById('inquiry')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const lastQuestion = [...t.messages].reverse().find(m => m.role === 'user')?.content;
  const whatsappMessage = lastQuestion
    ? `Hi Vivid Engine, I have a question about this answer: "${lastQuestion.slice(0, 200)}"`
    : 'Hi Vivid Engine, I have a question about ';
  const showMarketing = t.messages.length === 0;

  return <div className={`engine-site${account.isAuthenticated ? ' vh-signed' : ''}`}>
    <SEO path="/" />
    <AppShell account={account} activeThreadId={t.threadId} onOpenThread={t.openThread} onNewSearch={t.reset} whatsappMessage={whatsappMessage}>
      <main>
        <div className="vh-stage">
          <HomeSearch t={t} account={account} />
          {showMarketing && !account.isAuthenticated && <>
            <section className="vh-band" aria-labelledby="vh-search-features">
              <h2 id="vh-search-features">Answers you can check</h2>
              <p>Ask about anything, from homework to home repair. Every answer shows where it came from.</p>
              <div className="vh-feat">{SEARCH_FEATURES.map(([Icon, title, text]) => <article key={title}><Icon size={24} aria-hidden="true" /><b>{title}</b><span>{text}</span></article>)}</div>
            </section>
            <section className="vh-band" aria-labelledby="vh-build-features">
              <h2 id="vh-build-features">Then build it</h2>
              <p>Turn an answer into something real without leaving Vivid Engine.</p>
              <div className="vh-feat">{BUILD_FEATURES.map(([Icon, title, text, to]) => <article key={title}><Icon size={24} aria-hidden="true" /><b>{to.startsWith('/#') ? <a href={to.slice(1)}>{title}</a> : <Link to={to}>{title}</Link>}</b><span>{text}</span></article>)}</div>
            </section>
            <section className="vh-band" aria-labelledby="vh-local">
              <h2 id="vh-local">Local to Greater Houston, SE Texas &amp; SW Louisiana</h2>
              <p>For a custom website or app, we’ll meet you in person. <Link to="/service-areas" style={{ color: 'var(--glow)' }}>See our service areas</Link>.</p>
              <p className="engine-caps vh-brandline">Locally Owned. Personally Built. Professionally Maintained.</p>
            </section>
          </>}
        </div>
        <EngineServices />
        <EngineWork />
        <EngineProcess />
        <EnginePricing onSelect={selectPlan} />
        <PaymentOptions variant="section" />
        <EngineInquiry plan={selection.name} revision={selection.revision} />
      </main>
    </AppShell>
  </div>;
}
