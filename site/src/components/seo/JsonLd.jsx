import { useEffect } from 'react';

export default function JsonLd({ id, data }) {
  const json = data ? JSON.stringify(data) : null;
  useEffect(() => {
    if (!json) return;
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('script');
      el.id = id;
      document.head.appendChild(el);
    }
    el.type = 'application/ld+json';
    el.textContent = json;
    return () => el.remove();
  }, [id, json]);
  return null;
}