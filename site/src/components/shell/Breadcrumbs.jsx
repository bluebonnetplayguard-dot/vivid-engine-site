import { Link } from 'react-router-dom';

// Home > Section > Page, from config/navigation.ts. The last crumb is the current page.
export default function Breadcrumbs({ crumbs }) {
  if (!crumbs?.length) return null;
  return <nav className="vs-crumbs" aria-label="Breadcrumb"><ol>
    {crumbs.map((c, i) => <li key={c.path + i}>{i === crumbs.length - 1 ? <span aria-current="page">{c.label}</span> : <Link to={c.path}>{c.label}</Link>}</li>)}
  </ol></nav>;
}
