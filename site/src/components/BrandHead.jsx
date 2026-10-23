import { useEffect } from 'react';
import { SITE } from '@/data/seoSite';

const ICON_32 = `${SITE.url}/favicon-32.png`;
const ICON_180 = `${SITE.url}/apple-touch-icon.png`;
const ICON_192 = `${SITE.url}/favicon-192.png`;

function setLink(rel, href, extra = {}) {
  let el = document.head.querySelector(`link[rel="${rel}"]${extra.sizes ? `[sizes="${extra.sizes}"]` : ''}`);
  if (!el) { el = document.createElement('link'); el.rel = rel; document.head.appendChild(el); }
  el.href = href;
  Object.entries(extra).forEach(([k, v]) => el.setAttribute(k, v));
}

function setMeta(attr, key, content) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el); }
  el.setAttribute('content', content);
}

export default function BrandHead() {
  useEffect(() => {
    document.head.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]').forEach(el => el.remove());
    setLink('icon', ICON_32, { type: 'image/png', sizes: '32x32' });
    setLink('apple-touch-icon', ICON_180, { sizes: '180x180' });
    setLink('icon', ICON_192, { type: 'image/png', sizes: '192x192' });


    setMeta('name', 'theme-color', '#13233A');
    setMeta('name', 'apple-mobile-web-app-title', 'Vivid Engine');
  }, []);
  return null;
}