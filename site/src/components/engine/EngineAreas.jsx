import { Link } from 'react-router-dom';
const areas = [
  ['Southeast Texas', 'Beaumont Web Design', 'Beaumont, Port Arthur, Nederland, Orange, Vidor, Lumberton and Silsbee. Jefferson, Orange & Hardin counties.', 'Beaumont, TX', '/locations/beaumont-web-design'],
  ['Southwest Louisiana', 'Lake Charles App Development', 'Lake Charles, Sulphur, Westlake, Moss Bluff, DeRidder and Jennings. Calcasieu, Cameron, Beauregard & Jefferson Davis parishes.', 'Lake Charles, LA', '/locations/lake-charles-app-development'],
  ['Service', 'Custom App Development', 'iPhone, Android and web apps: booking, Stripe POS, CRM with calendar sync, client portals and staff tools.', 'App development', '/services/custom-app-development'],
];
export default function EngineAreas() {
  return <section id="areas" className="engine-section engine-band"><div className="engine-wrap">
    <div className="engine-head"><span className="engine-caps">Areas we serve</span><h2>In person across <span className="engine-blue">SETX &amp; SWLA</span></h2><p>We come to your shop or office to plan the build face to face. Pick your area or service to learn more.</p></div>
    <div className="engine-service-grid">{areas.map(([region, title, description, label, path]) => <Link to={path} className="engine-service engine-area-link" key={path}><span className="engine-caps">{region}</span><h3>{title}</h3><p>{description}</p><span className="engine-caps engine-service-meta">{label} →</span></Link>)}</div>
  </div></section>;
}