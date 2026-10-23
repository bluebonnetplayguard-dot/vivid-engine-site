import { Link } from 'react-router-dom';
import PricingTiers from '@/components/PricingTiers';
export default function LandingPricing() {
  return <div className="blueprint"><PricingTiers compact /><p className="pb-16 text-center"><Link to="/pricing" className="underline">See all options and compare plans</Link></p></div>;
}