const HEARTH_URL = "https://app.gethearth.com/flyers/bluebonnet-playguard-llc/brennan";

export default function HearthFinancing() {
  return (
    <section id="financing" className="mk-financing">
      <div className="mk-financing-inner">
        <span className="mono">Financing</span>
        <h2>Pay over time with Hearth</h2>
        <p>Flexible monthly payment plans through Hearth — get your project started now and spread the cost out over time.</p>
        <a className="mk-btn mk-btn-lg" href={HEARTH_URL} target="_blank" rel="noopener noreferrer">Get financing →</a>
      </div>
    </section>
  );
}