import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { ExternalLink } from 'lucide-react';
export default function PortfolioSection() {
  const { data, isLoading, isError } = useQuery({ queryKey: ['homepage-portfolio'], queryFn: () => api.entities.PortfolioItem.filter({ featured: true }, { sort: 'order', limit: 6 }) });
  return <section id="work" className="scroll-mt-24 border-y border-border bg-card/40 px-4 py-16">
    <div className="mx-auto max-w-6xl">
      <div className="mk-section-head"><span className="mono">Portfolio</span><h2>Built around the business</h2><p>Explore featured website and app projects from Vivid Engine Solutions.</p></div>
      {isLoading ? <p role="status" className="text-center text-muted-foreground">Loading featured work…</p> : isError ? <p role="alert" className="text-center text-muted-foreground">Featured work is unavailable right now. <a href="#inquiry" className="underline">Ask us for relevant examples.</a></p> : data?.items?.length ? <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">{data.items.map(project => <article key={project.id} className="rounded-xl border border-border bg-card p-6">
        <p className="text-xs uppercase tracking-widest text-primary">{project.category}</p><h3 className="mt-3 font-heading text-xl">{project.title}</h3>
        {project.client && <p className="mt-2 text-sm text-muted-foreground">{project.client}</p>}{project.description && <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{project.description}</p>}
        {/^https?:\/\//i.test(project.project_url || '') && <a href={project.project_url} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex items-center gap-2 text-sm underline">View project<ExternalLink size={14} aria-hidden="true" /></a>}
      </article>)}</div> : <p className="mx-auto max-w-xl text-center text-muted-foreground">Want to see work relevant to your business? <a href="#inquiry" className="underline">Request project examples with your quote.</a></p>}
    </div>
  </section>;
}