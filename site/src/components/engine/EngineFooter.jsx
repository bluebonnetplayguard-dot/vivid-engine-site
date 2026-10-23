import { Image } from '@/components/ui/image';
import { Link } from 'react-router-dom';
import InstallApp from '@/components/InstallApp';
export default function EngineFooter() {
  return <footer className="engine-footer"><div className="engine-wrap"><div className="engine-footer-cols">
    <div><Link className="engine-brand" to="/"><Image src="/logo-160.webp" className="engine-footer-logo" alt="" fittingType="fit" /><span>Vivid Engine<small>Solutions</small></span></Link><p>Locally owned. Personally built. Professionally maintained. Proudly serving Southeast Texas &amp; Southwest Louisiana.</p><InstallApp /></div>
    <div><h3 className="engine-caps">Services</h3><ul>{['Website design', 'Website maintenance', 'Domain leasing', 'Business solutions'].map(text => <li key={text}><a href="/#services">{text}</a></li>)}<li><Link to="/services/custom-app-development">App development</Link></li></ul></div>
    <div><h3 className="engine-caps">Areas</h3><ul><li><Link to="/locations/beaumont-web-design">Beaumont, TX</Link></li><li><Link to="/locations/lake-charles-app-development">Lake Charles, LA</Link></li></ul></div>
    <div><h3 className="engine-caps">Company</h3><ul><li><a href="/#work">Portfolio</a></li><li><Link to="/pricing">Pricing</Link></li><li><a href="/#inquiry">Get a quote</a></li><li><a href="/#pay">Pay online</a></li><li><a href="/#financing">Financing</a></li><li><Link to="/login?returnTo=%2Fportal">Client login</Link></li><li><Link to="/privacy">Privacy</Link></li></ul></div>
  </div><div className="engine-footer-bottom"><span>© {new Date().getFullYear()} Vivid Engine Solutions</span><span>Southeast Texas &amp; Southwest Louisiana</span></div></div></footer>;
}