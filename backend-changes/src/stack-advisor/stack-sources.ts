// Every data source Stack Advisor may read, with the terms we rely on.
// Neutrality rule: rankings and trust tiers are never for sale. No vendor can pay for a tier,
// placement or a better score. Any future ads go in a separate labeled "Sponsored" block.
export interface StackSource { id: string; use: string; terms: string; enabled: boolean }
export const STACK_SOURCES: StackSource[] = [
  { id: 'npm',        use: 'package metadata', terms: 'npm registry public API; follow rate limits', enabled: true },
  { id: 'pypi',       use: 'package metadata', terms: 'PyPI JSON API; follow rate limits', enabled: true },
  { id: 'crates',     use: 'package metadata', terms: 'crates.io API; requires User-Agent, 1 req/s', enabled: true },
  { id: 'dockerhub',  use: 'image metadata',   terms: 'Docker Hub metadata API; follow rate limits', enabled: true },
  { id: 'github',     use: 'repo, releases, license', terms: 'GitHub REST API with token in .env', enabled: true },
  { id: 'huggingface',use: 'models, licenses, tasks', terms: 'Hugging Face Hub API', enabled: true },
  { id: 'mcp-registry', use: 'MCP servers', terms: 'Official MCP registry plus each server repo/manifest', enabled: true },
  { id: 'osv',        use: 'vulnerabilities', terms: 'OSV.dev / GitHub Advisory Database (open data)', enabled: true },
  { id: 'official-docs', use: 'cross-check only', terms: 'Fetch politely (robots.txt, rate limits); store short facts and links, never copies', enabled: true },
  // Other tool directories: not used unless they offer an API or partnership and grant permission.
  { id: 'third-party-directories', use: 'none', terms: 'Not used. Add only as a separate, credited source with written permission.', enabled: false },
];
