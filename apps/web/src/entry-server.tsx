import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import App from './App';
import { findRoute, notFound, routes } from './routes';
import { headHtml } from './seo';
import { site } from './site';

export function render(path: string) {
  const html = renderToString(
    <StrictMode>
      <StaticRouter location={path}>
        <App />
      </StaticRouter>
    </StrictMode>,
  );
  return { html, head: headHtml(findRoute(path)) };
}

export const paths = [...routes.map((r) => r.path), notFound.path];
export const sitemapPaths = routes.filter((r) => !r.hidden).map((r) => r.path);
export const siteUrl = site.url;
