import { PLANS } from '@/config/pricing';
import EnginePlanGrid from '@/components/engine/EnginePlanGrid';
import EngineAddons from '@/components/engine/EngineAddons';
export default function EnginePricing({ onSelect }) {
  return <section id="pricing" className="engine-section"><div className="engine-wrap">
    <div className="engine-head"><span className="engine-caps">Pricing</span><h2>Straightforward and spelled out</h2><p>Pick a one-time build, add a monthly care plan, then add only the extras your business needs. Every project gets a written quote before work starts.</p></div>
    <h3 className="engine-price-group">Website builds <small>one-time</small></h3><EnginePlanGrid plans={PLANS.filter(plan => plan.billing === 'one_time')} onSelect={onSelect} />
    <h3 className="engine-price-group">Monthly care <small>after launch</small></h3><EnginePlanGrid plans={PLANS.filter(plan => plan.billing === 'monthly')} onSelect={onSelect} care />
    <h3 className="engine-price-group" id="addons">Add-ons <small>only what you need</small></h3><EngineAddons onSelect={onSelect} />
    <p className="engine-disclaimer">Applicable sales tax is calculated at checkout.</p>
    <p className="engine-pay-note">Already a client? <a href="/#pay">Pay an invoice online →</a> · Bigger build? <a href="/#financing">Pay over time →</a></p>
  </div></section>;
}