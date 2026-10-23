import type { ReactNode } from 'react';
import { areas, services } from './content';
import { localBusinessSchema, serviceSchema } from './seo';
import Home from './pages/Home';
import ServicePage from './pages/ServicePage';
import AreaPage from './pages/AreaPage';
import About from './pages/About';
import Contact from './pages/Contact';
import NotFound from './pages/NotFound';
import { site } from './site';

export type RouteDef = {
  path: string;
  title: string;
  description: string;
  element: ReactNode;
  schema?: object[];
  /** Pages left out of the sitemap and marked noindex. */
  hidden?: boolean;
};

export const routes: RouteDef[] = [
  {
    path: '/',
    title: `${site.name} | Web Design & Local SEO in Beaumont, TX and Lake Charles, LA`,
    description: site.description,
    element: <Home />,
    schema: [localBusinessSchema()],
  },
  ...services.map((s) => ({
    path: `/services/${s.slug}`,
    title: `${s.title} | ${site.shortName}`,
    description: s.description,
    element: <ServicePage service={s} />,
    schema: [serviceSchema(s)],
  })),
  ...areas.map((a) => ({
    path: `/areas/${a.slug}`,
    title: `${a.title} | ${site.shortName}`,
    description: a.description,
    element: <AreaPage area={a} />,
    schema: [localBusinessSchema(a)],
  })),
  {
    path: '/about',
    title: `About | ${site.name}`,
    description: `${site.name} is a web design and local SEO studio serving Beaumont, TX and Lake Charles, LA.`,
    element: <About />,
  },
  {
    path: '/contact',
    title: `Contact | ${site.name}`,
    description: 'Tell us about your business and get a free website and local SEO review.',
    element: <Contact />,
  },
];

export const notFound: RouteDef = {
  path: '/404',
  title: `Page not found | ${site.shortName}`,
  description: 'That page could not be found.',
  element: <NotFound />,
  hidden: true,
};

export function findRoute(pathname: string): RouteDef {
  const clean = pathname.replace(/\/+$/, '') || '/';
  return routes.find((r) => r.path === clean) ?? notFound;
}
