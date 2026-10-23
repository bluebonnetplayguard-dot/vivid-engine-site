// Loads the editor's fonts from Google Fonts once, and makes sure the ones a project uses are
// ready before drawing (a canvas silently falls back to another font if one is still loading).
import { FONTS } from './model';

let linked = false;

// Weights each family actually has (Google Fonts rejects a request for a missing weight).
const WEIGHTS = {
  Inter: '400;500;600;700;800;900', Montserrat: '400;500;600;700;800;900', Poppins: '400;500;600;700;800;900', Oswald: '400;500;600;700',
  'Playfair Display': '400;500;600;700;800;900', Lora: '400;500;600;700', Merriweather: '400;700;900', 'Roboto Slab': '400;500;600;700;800;900',
  Raleway: '400;500;600;700;800;900', 'Space Grotesk': '400;500;600;700', Caveat: '400;500;600;700',
};

export function linkFonts() {
  if (linked || typeof document === 'undefined') return;
  linked = true;
  const families = FONTS.map(f => `family=${f.replace(/ /g, '+')}${WEIGHTS[f] ? `:wght@${WEIGHTS[f]}` : ''}`).join('&');
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`;
  document.head.appendChild(link);
}

export async function ensureFonts(project) {
  linkFonts();
  const used = new Set(['Inter']);
  if (project.captionStyle?.font) used.add(project.captionStyle.font);
  for (const t of project.tracks) for (const c of t.clips) if (c.text?.font) used.add(c.text.font);
  await Promise.all([...used].map(f => Promise.all([document.fonts.load(`400 32px "${f}"`), document.fonts.load(`800 32px "${f}"`)]).catch(() => {})));
}
