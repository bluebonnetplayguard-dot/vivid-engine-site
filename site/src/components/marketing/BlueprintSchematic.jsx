export default function BlueprintSchematic() {
  const ink = "bp-ink";
  const copper = "bp-copper";
  const steel = "bp-steel";
  const mono = "font-mono";
  return (
    <svg viewBox="0 0 560 430" className="w-full" role="img" aria-label="Blueprint schematic of a website being drafted">
      <rect x="8" y="8" width="544" height="414" className={ink} fill="none" strokeWidth="1" />

      {/* browser frame */}
      <rect x="48" y="44" width="464" height="300" className={ink} fill="none" strokeWidth="1.5" />
      <rect x="48" y="44" width="464" height="26" className={ink} fill="none" strokeWidth="1.5" />
      <circle cx="62" cy="57" r="3" className={copper} fill="none" strokeWidth="1.5" />
      <circle cx="74" cy="57" r="3" className={steel} fill="none" strokeWidth="1.5" />
      <circle cx="86" cy="57" r="3" className={steel} fill="none" strokeWidth="1.5" />
      <line x1="100" y1="57" x2="500" y2="57" className={steel} strokeWidth="1" />

      {/* nav row */}
      <line x1="64" y1="92" x2="120" y2="92" className={ink} strokeWidth="2" />
      <line x1="430" y1="90" x2="496" y2="90" className={steel} strokeWidth="1" />
      <line x1="430" y1="98" x2="480" y2="98" className={steel} strokeWidth="1" />
      <line x1="430" y1="106" x2="466" y2="106" className={steel} strokeWidth="1" />

      {/* hero block */}
      <rect x="64" y="110" width="220" height="120" className={ink} fill="none" strokeWidth="1.5" />
      <line x1="64" y1="150" x2="200" y2="150" className={ink} strokeWidth="2" />
      <line x1="64" y1="166" x2="240" y2="166" className={steel} strokeWidth="1" />
      <line x1="64" y1="178" x2="224" y2="178" className={steel} strokeWidth="1" />
      <rect x="64" y="196" width="80" height="22" className={copper} fill="none" strokeWidth="1.5" />
      {/* hero image placeholder */}
      <rect x="300" y="110" width="196" height="120" className={ink} fill="none" strokeWidth="1" />
      <line x1="300" y1="110" x2="496" y2="230" className={steel} strokeWidth="1" />
      <line x1="496" y1="110" x2="300" y2="230" className={steel} strokeWidth="1" />

      {/* content grid */}
      <rect x="64" y="246" width="132" height="80" className={ink} fill="none" strokeWidth="1" />
      <rect x="208" y="246" width="132" height="80" className={ink} fill="none" strokeWidth="1" />
      <rect x="352" y="246" width="132" height="80" className={ink} fill="none" strokeWidth="1" />
      <line x1="76" y1="270" x2="184" y2="270" className={steel} strokeWidth="1" />
      <line x1="76" y1="280" x2="160" y2="280" className={steel} strokeWidth="1" />

      {/* footer bar */}
      <line x1="64" y1="334" x2="496" y2="334" className={ink} strokeWidth="1.5" />
      <line x1="64" y1="330" x2="120" y2="330" className={steel} strokeWidth="1" />

      {/* width dimension (bottom) */}
      <line x1="48" y1="368" x2="512" y2="368" className={steel} strokeWidth="1" />
      <line x1="48" y1="362" x2="48" y2="374" className={steel} strokeWidth="1" />
      <line x1="512" y1="362" x2="512" y2="374" className={steel} strokeWidth="1" />
      <line x1="48" y1="344" x2="48" y2="368" className={steel} strokeWidth="0.5" strokeDasharray="2 3" />
      <line x1="512" y1="344" x2="512" y2="368" className={steel} strokeWidth="0.5" strokeDasharray="2 3" />
      <text x="280" y="383" textAnchor="middle" className={`${ink} ${mono}`} style={{ fontSize: 10, letterSpacing: "0.15em" }}>W · 100%</text>

      {/* height dimension (right) */}
      <line x1="536" y1="44" x2="536" y2="344" className={steel} strokeWidth="1" />
      <line x1="530" y1="44" x2="542" y2="44" className={steel} strokeWidth="1" />
      <line x1="530" y1="344" x2="542" y2="344" className={steel} strokeWidth="1" />
      <line x1="512" y1="44" x2="536" y2="44" className={steel} strokeWidth="0.5" strokeDasharray="2 3" />
      <line x1="512" y1="344" x2="536" y2="344" className={steel} strokeWidth="0.5" strokeDasharray="2 3" />
      <text x="544" y="56" className={`${ink} ${mono}`} style={{ fontSize: 10, letterSpacing: "0.15em" }}>H</text>

      {/* callouts */}
      <line x1="160" y1="92" x2="160" y2="30" className={copper} strokeWidth="1" />
      <circle cx="160" cy="92" r="2" className="bp-copper-fill" />
      <text x="164" y="26" className={`${copper} ${mono}`} style={{ fontSize: 9, letterSpacing: "0.15em" }}>NAV</text>

      <line x1="174" y1="170" x2="174" y2="396" className={copper} strokeWidth="1" />
      <circle cx="174" cy="170" r="2" className="bp-copper-fill" />
      <text x="178" y="404" className={`${copper} ${mono}`} style={{ fontSize: 9, letterSpacing: "0.15em" }}>HERO · CTA</text>

      <line x1="418" y1="286" x2="418" y2="30" className={copper} strokeWidth="1" />
      <circle cx="418" cy="286" r="2" className="bp-copper-fill" />
      <text x="424" y="26" className={`${copper} ${mono}`} style={{ fontSize: 9, letterSpacing: "0.15em" }}>CONTENT GRID</text>

      {/* title block */}
      <rect x="376" y="392" width="136" height="22" className={ink} fill="none" strokeWidth="1" />
      <line x1="376" y1="403" x2="512" y2="403" className={ink} strokeWidth="0.5" />
      <text x="382" y="401" className={`${ink} ${mono}`} style={{ fontSize: 8, letterSpacing: "0.1em" }}>SITE.DWG</text>
      <text x="382" y="411" className={`${steel} ${mono}`} style={{ fontSize: 7, letterSpacing: "0.1em" }}>SHEET 01 / 01</text>
    </svg>
  );
}