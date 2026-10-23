// Ready-made video templates. Each builds clips from the active brand kit's colors and fonts.
// Media placeholders ("Add your photo or video") are filled by selecting them and choosing a file.
import { emptyProject, LEVELS, makeClip, projectLevel, uid } from './model';

export const DEFAULT_BRAND = {
  colors: { primary: '#1f6feb', secondary: '#0b1220', accent: '#ffb703', text: '#ffffff', background: '#0b1220' },
  headingFont: 'Montserrat', bodyFont: 'Inter', logo: null, logoPosition: 'bottom-right',
};

// Small helpers so each template reads like a script.
function kit(brand) {
  const b = { ...DEFAULT_BRAND, ...brand, colors: { ...DEFAULT_BRAND.colors, ...brand?.colors } };
  const c = b.colors;
  return {
    c,
    bg: (start, duration, from = c.secondary, to = c.primary, transition = null) =>
      makeClip('shape', { start, duration, shape: { kind: 'rect', color: from, color2: to, w: 1, h: 1, angle: 120 }, anim: { in: 'none', out: 'none' }, transition }),
    media: (start, duration, extra = {}) => makeClip('video', { start, duration, assetId: null, placeholder: true, effects: [{ id: 'kenburns', params: { amount: 0.1 } }], ...extra }),
    title: (start, duration, content, extra = {}) => makeClip('text', { start, duration, ...extra, text: { content, font: b.headingFont, size: 120, weight: 800, color: c.text, ...extra.text } }),
    body: (start, duration, content, extra = {}) => makeClip('text', { start, duration, ...extra, text: { content, font: b.bodyFont, size: 54, weight: 500, color: c.text, shadow: false, ...extra.text } }),
    bar: (start, duration, extra = {}) => makeClip('shape', { start, duration, ...extra, shape: { kind: 'rect', color: c.accent, w: 0.18, h: 0.012, radius: 8, ...extra.shape } }),
  };
}

const vertical = aspect => aspect === '9:16' || aspect === '4:5';

export const TEMPLATES = [
  {
    id: 'bold-intro', name: 'Bold intro', category: 'Intros', level: 'basic', duration: 5,
    build: (k, a) => ({
      main: [k.bg(0, 5)],
      overlay: [k.bar(0.4, 4.6, { y: vertical(a) ? 0.56 : 0.6, anim: { in: 'fade', out: 'fade' } })],
      text: [k.title(0.2, 4.8, 'Your Brand Name', { anim: { in: 'rise', out: 'fade' }, y: 0.47 }), k.body(0.8, 4.2, 'Your tagline goes here', { y: vertical(a) ? 0.62 : 0.68, anim: { in: 'rise', out: 'fade' } })],
    }),
  },
  {
    id: 'promo-sale', name: 'Flash sale', category: 'Promos', level: 'basic', duration: 9,
    build: k => ({
      main: [k.bg(0, 3, k.c.primary, k.c.accent), k.bg(3, 3, k.c.secondary, k.c.primary, { type: 'fade', duration: 0.5 }), k.bg(6, 3, k.c.accent, k.c.primary, { type: 'fade', duration: 0.5 })],
      overlay: [],
      text: [
        k.title(0.1, 2.9, 'BIG SALE', { text: { size: 190, font: 'Anton', weight: 400 }, anim: { in: 'rise', out: 'fade' } }),
        k.title(3.1, 2.9, 'Up to 50% off', { anim: { in: 'rise', out: 'fade' } }),
        k.title(6.1, 1.6, 'Shop now', { y: 0.44, anim: { in: 'rise', out: 'none' } }),
        k.body(6.4, 2.6, 'yourwebsite.com', { y: 0.6, text: { bg: '#00000066' }, anim: { in: 'fade', out: 'fade' } }),
      ],
    }),
  },
  {
    id: 'quote-card', name: 'Quote', category: 'Social', level: 'basic', duration: 6,
    build: (k, a) => ({
      main: [k.bg(0, 6, k.c.background, k.c.secondary)],
      overlay: [k.bar(0.3, 5.7, { y: vertical(a) ? 0.36 : 0.3, anim: { in: 'fade', out: 'fade' } })],
      text: [
        k.title(0.4, 5.6, '“Great things never come from comfort zones.”', { text: { font: 'Playfair Display', weight: 400, size: 84, maxWidth: 0.78 }, anim: { in: 'fade', out: 'fade' } }),
        k.body(1.4, 4.6, '— Author name', { y: vertical(a) ? 0.66 : 0.74, text: { color: k.c.accent }, anim: { in: 'rise', out: 'fade' } }),
      ],
    }),
  },
  {
    id: 'news-lower-third', name: 'Talking head + name', category: 'Business', level: 'basic', duration: 8,
    build: () => null,
    custom: (k, a) => ({
      main: [k.media(0, 8, { effects: [] })],
      overlay: [makeClip('shape', { start: 0.5, duration: 7, x: vertical(a) ? 0.5 : 0.3, y: 0.83, shape: { kind: 'rect', color: k.c.primary, w: vertical(a) ? 0.84 : 0.44, h: 0.11, radius: 10 }, anim: { in: 'rise', out: 'fade' } })],
      text: [k.body(0.7, 6.8, 'Jordan Smith · Founder', { x: vertical(a) ? 0.5 : 0.3, y: 0.83, text: { weight: 700, size: 46 }, anim: { in: 'rise', out: 'fade' } })],
    }),
  },
  {
    id: 'event-invite', name: 'Event invite', category: 'Events', level: 'standard', duration: 8,
    build: (k, a) => ({
      main: [k.bg(0, 8, k.c.secondary, k.c.primary)],
      overlay: [makeClip('shape', { start: 0.2, duration: 7.8, y: 0.5, shape: { kind: 'rect', color: '#ffffff14', w: vertical(a) ? 0.86 : 0.6, h: vertical(a) ? 0.5 : 0.7, radius: 28 }, anim: { in: 'pop', out: 'fade' } })],
      text: [
        k.body(0.5, 7.5, 'YOU’RE INVITED', { y: vertical(a) ? 0.33 : 0.25, text: { color: k.c.accent, weight: 700, letterSpacing: 8 }, anim: { in: 'rise', out: 'fade' } }),
        k.title(0.9, 7.1, 'Grand Opening', { y: 0.45, anim: { in: 'pop', out: 'fade' } }),
        k.body(1.5, 6.5, 'Saturday, June 14 · 6 PM\n123 Main Street', { y: vertical(a) ? 0.6 : 0.66, anim: { in: 'rise', out: 'fade' } }),
      ],
    }),
  },
  {
    id: 'product-showcase', name: 'Product showcase', category: 'Promos', level: 'standard', duration: 10,
    build: (k, a) => ({
      main: [k.media(0, 5), k.media(5, 5, { transition: { type: 'slideleft', duration: 0.6 } })],
      overlay: [makeClip('shape', { start: 0, duration: 10, y: vertical(a) ? 0.84 : 0.86, shape: { kind: 'rect', color: '#000000', color2: '#00000000', w: 1, h: 0.3, angle: 270 }, anim: { in: 'none', out: 'none' } })],
      text: [
        k.title(0.3, 4.5, 'Meet the new product', { y: vertical(a) ? 0.8 : 0.82, text: { size: 84 }, anim: { in: 'rise', out: 'fade' } }),
        k.title(5.4, 4.6, 'Built to last. Priced right.', { y: vertical(a) ? 0.8 : 0.82, text: { size: 72 }, anim: { in: 'typewriter', out: 'fade' } }),
      ],
    }),
  },
  {
    id: 'testimonial', name: 'Customer review', category: 'Business', level: 'standard', duration: 7,
    build: (k, a) => ({
      main: [k.bg(0, 7, k.c.background, k.c.secondary)],
      overlay: [],
      text: [
        k.title(0.3, 6.7, '★★★★★', { y: vertical(a) ? 0.32 : 0.26, text: { color: k.c.accent, size: 90 }, anim: { in: 'pop', out: 'fade' } }),
        k.body(0.8, 6.2, '“Paste a real review from your customer here.”', { y: 0.48, text: { size: 60, weight: 600, maxWidth: 0.8 }, anim: { in: 'fade', out: 'fade' } }),
        k.body(1.6, 5.4, 'Customer name · City', { y: vertical(a) ? 0.64 : 0.72, text: { color: k.c.accent }, anim: { in: 'rise', out: 'fade' } }),
      ],
    }),
  },
  {
    id: 'tips-list', name: '3 quick tips', category: 'Social', level: 'standard', duration: 12,
    build: k => ({
      main: [k.bg(0, 3), k.bg(3, 3, k.c.primary, k.c.secondary, { type: 'slideup', duration: 0.5 }), k.bg(6, 3, k.c.secondary, k.c.primary, { type: 'slideup', duration: 0.5 }), k.bg(9, 3, k.c.primary, k.c.accent, { type: 'slideup', duration: 0.5 })],
      overlay: [],
      text: [
        k.title(0.2, 2.8, '3 tips to grow your business', { anim: { in: 'typewriter', out: 'fade' } }),
        k.title(3.3, 2.7, '1. Post every week', { anim: { in: 'slide', out: 'fade' } }),
        k.title(6.3, 2.7, '2. Answer every review', { anim: { in: 'slide', out: 'fade' } }),
        k.title(9.3, 2.7, '3. Keep your site fast', { anim: { in: 'slide', out: 'fade' } }),
      ],
    }),
  },
  {
    id: 'youtube-outro', name: 'YouTube end screen', category: 'Intros', level: 'standard', duration: 10, aspects: ['16:9'],
    build: k => ({
      main: [k.bg(0, 10)],
      overlay: [
        makeClip('video', { start: 0.4, duration: 9.6, assetId: null, placeholder: true, fit: 'cover', x: 0.3, y: 0.55, scale: 0.36, radius: 18, effects: [{ id: 'shadow', params: {} }] }),
        makeClip('video', { start: 0.6, duration: 9.4, assetId: null, placeholder: true, fit: 'cover', x: 0.72, y: 0.55, scale: 0.36, radius: 18, effects: [{ id: 'shadow', params: {} }] }),
      ],
      text: [k.title(0.2, 9.8, 'Thanks for watching!', { y: 0.16, text: { size: 88 }, anim: { in: 'pop', out: 'fade' } }), k.body(0.8, 9.2, 'Subscribe for more', { y: 0.88, text: { color: k.c.accent, weight: 700 }, anim: { in: 'rise', out: 'fade' } })],
    }),
  },
  {
    id: 'cinematic-title', name: 'Cinematic title', category: 'Intros', level: 'pro', duration: 7,
    build: () => null,
    custom: k => ({
      main: [k.media(0, 7, { filter: 'cinematic', effects: [{ id: 'kenburns', params: { amount: 0.15 } }, { id: 'vignette', params: { amount: 0.7 } }, { id: 'grain', params: { amount: 0.1 } }] })],
      overlay: [],
      text: [k.title(0.8, 5.8, 'THE JOURNEY', { text: { font: 'Bebas Neue', weight: 400, size: 170, letterSpacing: 18 }, anim: { in: 'spread', out: 'blur' } })],
    }),
  },
  {
    id: 'countdown', name: 'Countdown', category: 'Events', level: 'pro', duration: 6,
    build: k => ({
      main: [k.bg(0, 1.5, k.c.secondary, k.c.primary), k.bg(1.5, 1.5, k.c.primary, k.c.secondary, { type: 'glitch', duration: 0.3 }), k.bg(3, 1.5, k.c.secondary, k.c.accent, { type: 'glitch', duration: 0.3 }), k.bg(4.5, 1.5, k.c.accent, k.c.primary, { type: 'zoom', duration: 0.4 })],
      overlay: [],
      text: ['3', '2', '1'].map((n, i) => k.title(i * 1.5 + 0.05, 1.4, n, { text: { size: 340, font: 'Anton', weight: 400 }, anim: { in: 'bounce', out: 'none' } }))
        .concat(k.title(4.6, 1.4, 'We’re live!', { anim: { in: 'pop', out: 'none' } })),
    }),
  },
  {
    id: 'social-hook', name: 'Viral hook', category: 'Social', level: 'pro', duration: 6, aspects: ['9:16', '1:1', '4:5'],
    build: () => null,
    custom: k => ({
      main: [k.media(0, 6, { effects: [{ id: 'kenburns', params: { amount: 0.2 } }], filter: 'vivid' })],
      overlay: [],
      text: [k.title(0.2, 5.6, 'Stop scrolling. This changes everything.', { y: 0.4, text: { size: 104, uppercase: true, stroke: '#000000', strokeWidth: 6, shadow: false, font: 'Anton', weight: 400, maxWidth: 0.86 }, anim: { in: 'words', out: 'fade' } })],
    }),
  },
];

// Splits clips into lanes where none overlap, so each lane can be its own track.
function packLanes(clips) {
  const lanes = [];
  for (const c of [...clips].sort((a, b) => a.start - b.start)) {
    const lane = lanes.find(l => l[l.length - 1].start + l[l.length - 1].duration <= c.start + 0.001);
    if (lane) lane.push(c); else lanes.push([c]);
  }
  return lanes.length ? lanes : [[]];
}

// Builds a full project from a template for the given aspect and brand kit.
// Overlapping clips go on extra layers so every clip can be seen and selected on the timeline.
export function projectFromTemplate(template, aspect, brand) {
  const k = kit(brand);
  const parts = (template.custom ?? template.build)(k, aspect);
  const project = emptyProject(aspect, template.name);
  project.background = k.c.background;
  const visual = [
    ...packLanes(parts.main).map((clips, i) => ({ name: i ? `Main ${i + 1}` : 'Main', clips })),
    ...packLanes(parts.overlay).map((clips, i) => ({ name: i ? `Overlay ${i + 1}` : 'Overlay', clips })),
    ...packLanes(parts.text).map((clips, i) => ({ name: i ? `Text ${i + 1}` : 'Text', clips })),
  ].map(t => ({ id: uid('t'), kind: 'visual', ...t }));
  project.tracks = [...visual, ...project.tracks.filter(t => t.kind !== 'visual')];
  return project;
}

export function fitsAspect(template, aspect) { return !template.aspects || template.aspects.includes(aspect); }

// The plan level a template needs: its own label, or higher if its effects and animations need more,
// so a template offered on a plan can always be exported on that plan.
const levelCache = new Map();
export function templateLevel(template) {
  if (!levelCache.has(template.id)) {
    const used = projectLevel(projectFromTemplate(template, template.aspects?.[0] ?? '16:9', null));
    levelCache.set(template.id, LEVELS[used] > LEVELS[template.level] ? used : template.level);
  }
  return levelCache.get(template.id);
}
