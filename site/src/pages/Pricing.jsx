import { useState } from 'react';
import SEO from '@/components/seo/SEO';
import { PAGE_SEO } from '@/data/seoSite';
import EngineNav from '@/components/engine/EngineNav';
import EnginePricing from '@/components/engine/EnginePricing';
import EngineInquiry from '@/components/engine/EngineInquiry';
import EngineFooter from '@/components/engine/EngineFooter';
import '@/components/engine/engine.css';

export default function Pricing() {
  const [selection, setSelection] = useState({ name: '', revision: 0 });
  const selectPlan = name => {
    setSelection(previous => ({ name, revision: previous.revision + 1 }));
    document.getElementById('inquiry')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return <div className="engine-site"><SEO {...PAGE_SEO.pricing} /><EngineNav /><main><EnginePricing onSelect={selectPlan} /><EngineInquiry plan={selection.name} revision={selection.revision} /></main><EngineFooter /></div>;
}