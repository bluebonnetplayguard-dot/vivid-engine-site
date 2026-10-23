import { Link } from 'react-router-dom';
import { Image } from '@/components/ui/image';

export default function RegionalFooter() {
  return <footer><div className="wrap"><div className="cols">
    <div><Link className="brand" to="/"><Image src="/logo-160.webp" className="regional-footer-logo" alt="" fittingType="fit" /><span className="word">Vivid Engine<small>Solutions</small></span></Link><p>Locally owned. Personally built. Professionally maintained. Proudly serving Southeast Texas &amp; Southwest Louisiana.</p></div>
    <div><h4>Services</h4><ul>{[['/#services', 'Website design'], ['/services/custom-app-development', 'App development'], ['/#services', 'Maintenance & hosting'], ['/#services', 'Domain leasing']].map(([url, label]) => <li key={label}><Link to={url}>{label}</Link></li>)}</ul></div>
    <div><h4>Areas</h4><ul><li><Link to="/locations/beaumont-web-design">Beaumont, TX</Link></li><li><Link to="/locations/lake-charles-app-development">Lake Charles, LA</Link></li></ul></div>
    <div><h4>Company</h4><ul>{[['/#pricing', 'Pricing'], ['/#pay', 'Pay online'], ['/#inquiry', 'Get a quote'], ['/login?returnTo=%2Fportal', 'Client login']].map(([url, label]) => <li key={label}><Link to={url}>{label}</Link></li>)}</ul></div>
  </div><div className="foot-bottom"><span>© {new Date().getFullYear()} Vivid Engine Solutions</span><span>Southeast Texas &amp; Southwest Louisiana</span></div></div></footer>;
}