import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowUp } from 'lucide-react';
import '@/components/aisearch/ai-search.css';

// Homepage entry point to Vivid AI Search: type a question, land on /ai-search with it asked.
export default function EngineAiSearch() {
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const go = e => { e.preventDefault(); const t = q.trim(); navigate(t ? `/ai-search?q=${encodeURIComponent(t.slice(0, 1500))}` : '/ai-search'); };
  return <section id="ai-search" className="engine-section"><div className="engine-wrap ais-promo">
    <div>
      <span className="engine-caps">New · Vivid AI Search</span>
      <h2>Research anything. <span className="engine-blue">Plan your website.</span></h2>
      <p>Ask a question and get an answer from live web search, with sources. Plan pages, write copy and SEO, or get working code. Paid plans add second opinions from other AI engines.</p>
    </div>
    <div>
      <form onSubmit={go} role="search" aria-label="Ask Vivid AI Search">
        <label htmlFor="home-ais" className="sr-only">Ask Vivid AI Search</label>
        <input id="home-ais" value={q} onChange={e => setQ(e.target.value)} placeholder="What should my landscaping website include?" maxLength={1500} />
        <button type="submit" className="ais-send" aria-label="Ask"><ArrowUp size={20} /></button>
      </form>
      <small>Free account: 5 questions a day. <Link to="/ai-search/pricing" style={{ color: 'var(--glow)' }}>See plans</Link></small>
    </div>
  </div></section>;
}
