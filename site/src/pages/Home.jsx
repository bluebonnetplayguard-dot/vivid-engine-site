import { BookOpen, Telescope, FileSearch, Mic, Code, Clapperboard, Briefcase, Users, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import SEO from '@/components/seo/SEO';
import HomeSearch from '@/components/home/HomeSearch';
import useAskThread from '@/components/home/useAskThread';
import { usePageShell } from '@/components/shell/ShellContext';
import { SERVICES } from '@/config/services';
import { AREAS } from '@/config/areas';
import { BUSINESS } from '@/config/business';
import { STEPS } from '@/components/engine/siteContent';

const SEARCH_FEATURES = [
  [BookOpen, 'Answers with sources', 'Live web results with numbered citations you can open.'],
  [Telescope, 'Deep research', 'Ask follow-ups in the same thread and go as deep as you need.'],
  [FileSearch, 'Any topic', 'Homework, home repair, shopping, local help or business questions.'],
  [Mic, 'Voice and files', 'Ask out loud, or attach a photo or PDF when you are signed in.'],
];
const BUILD_FEATURES = [
  [Code, 'Websites & apps', 'Turn an answer into a site or app plan, then have us build it.', '/build'],
  [Clapperboard, 'Video', 'Promo clips and social video, made by you or by our team.', '/create'],
  [Briefcase, 'Business help', 'Pricing, marketing, Google listings and reviews, explained.', '/business'],
  [Users, 'Built for you', 'Prefer a person? Our local team builds and maintains it.', '/quote'],
];

// Home: one heading, the ask box, then readable content about what we do and where (for guests).
export default function Home() {
  const shell = usePageShell(null);
  const account = shell?.account;
  const t = useAskThread(account);
  const lastQuestion = [...t.messages].reverse().find(m => m.role === 'user')?.content;
  usePageShell({
    activeThreadId: t.threadId, onOpenThread: t.openThread, onNewSearch: t.reset, hideBreadcrumbs: true,
    whatsappMessage: lastQuestion ? `Hi Vivid Engine, I have a question about this answer: "${lastQuestion.slice(0, 200)}"` : 'Hi Vivid Engine, I have a question about ',
  });
  const showMarketing = t.messages.length === 0 && !account?.isAuthenticated;

  return <main>
    <SEO path="/" />
    <div className="vh-stage">
      <HomeSearch t={t} account={account} />
      {showMarketing && <>
        <section className="vh-band" aria-labelledby="vh-search-features">
          <h2 id="vh-search-features">Answers you can check</h2>
          <p>Ask about anything, from homework to home repair. Every answer shows where it came from, and which engine wrote it.</p>
          <div className="vh-feat">{SEARCH_FEATURES.map(([Icon, title, text]) => <article key={title}><Icon size={24} aria-hidden="true" /><b>{title}</b><span>{text}</span></article>)}</div>
        </section>
        <section className="vh-band" aria-labelledby="vh-build-features">
          <h2 id="vh-build-features">Then build it</h2>
          <p>Turn an answer into something real without leaving Vivid Engine.</p>
          <div className="vh-feat">{BUILD_FEATURES.map(([Icon, title, text, to]) => <article key={title}><Icon size={24} aria-hidden="true" /><b><Link to={to}>{title}</Link></b><span>{text}</span></article>)}</div>
        </section>
        <section className="vh-band" aria-labelledby="vh-services">
          <h2 id="vh-services">Services from a local team</h2>
          <p>One team designs it, launches it and keeps it running. Every project starts with a free consultation and a written quote.</p>
          <ul className="vh-list">{SERVICES.map(s => <li key={s.slug}><Link to={s.path}><b>{s.name}</b><span>{s.short}</span></Link></li>)}</ul>
        </section>
        <section className="vh-band" aria-labelledby="vh-process">
          <h2 id="vh-process">How a build works</h2>
          <ol className="vh-steps">{STEPS.map(([title, text]) => <li key={title}><b>{title}</b><span>{text}</span></li>)}</ol>
          <p><Link to="/process" className="vh-more">More about our process</Link> · <Link to="/pricing" className="vh-more">See pricing</Link> · <Link to="/portfolio" className="vh-more">See our work</Link></p>
        </section>
        <section className="vh-band" aria-labelledby="vh-areas">
          <h2 id="vh-areas"><MapPin size={20} aria-hidden="true" /> Where we work</h2>
          <p>We meet clients in person across {BUSINESS.regionLine.replace(/^Serving /, '')}.</p>
          <ul className="vh-areas">{AREAS.map(a => <li key={a.slug}><Link to={`/areas/${a.slug}`}>{a.city}, {a.state}</Link></li>)}</ul>
          <p className="engine-caps vh-brandline">{BUSINESS.brandLine}</p>
          <p><Link className="engine-button engine-primary" to="/quote">Get a quote</Link></p>
        </section>
      </>}
    </div>
  </main>;
}
