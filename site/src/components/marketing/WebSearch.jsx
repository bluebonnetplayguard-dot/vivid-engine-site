import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import BottomDrawerSelect from "@/components/ui/BottomDrawerSelect";

const ENGINES = [
  { label: "Google", value: "https://www.google.com/search?q=" },
  { label: "DuckDuckGo", value: "https://duckduckgo.com/?q=" },
  { label: "Bing", value: "https://www.bing.com/search?q=" },
];

export default function WebSearch() {
  const [engine, setEngine] = useState(ENGINES[0].value);
  const [query, setQuery] = useState("");

  function handleSubmit(event) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    window.open(engine + encodeURIComponent(trimmed), "_blank", "noopener,noreferrer");
  }

  return (
    <div className="px-4 py-8">
      <form id="search-form" role="search" aria-label="Search the web" onSubmit={handleSubmit} className="mx-auto flex max-w-[560px] flex-wrap items-center gap-2">
        <div className="w-full sm:hidden" role="group" aria-label="Search engine">
          <BottomDrawerSelect value={engine} onChange={setEngine} options={ENGINES} title="Search engine" variant="blueprint"
            triggerClassName="flex min-h-11 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring" />
        </div>
        <select id="engine" aria-label="Search engine" value={engine} onChange={(event) => setEngine(event.target.value)}
          className="hidden min-h-11 rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring sm:block">
          {ENGINES.map(({ label, value }) => <option key={value} value={value}>{label}</option>)}
        </select>
        <Input id="q" name="q" type="search" aria-label="Search or enter website name" placeholder="Search or enter website name" required
          value={query} onChange={(event) => setQuery(event.target.value)} className="min-h-11 min-w-0 flex-1 rounded-full px-3.5" />
        <Button type="submit" className="min-h-11" disabled={!query.trim()}>Search</Button>
      </form>
    </div>
  );
}