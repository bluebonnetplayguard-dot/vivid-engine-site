export type Tier = 'verified' | 'checked' | 'indexed' | 'unknown';
export type Method = 'lab' | 'cross-check' | 'registry';
export type Result = 'pass' | 'fail' | 'partial';
export interface Evidence { tier: Tier; method: Method; date: string; source: string; result: Result; notes: string; versions?: Record<string, string>; mock?: boolean }
export interface Tool { id: string; name: string; category: string; description: string; license: string; languages: string[]; selfHost: boolean; cloud: boolean; pricing: string; runtime?: Record<string, string>; copyleft?: boolean; commercialUseOk: boolean; lastRelease?: string; openIssues?: number }
export interface Edge { a: string; b: string; type: 'official-integration' | 'plugin' | 'adapter' | 'protocol-compatible' | 'community'; evidence: Evidence[] }
export interface Db { tools: Tool[]; edges: Edge[] }
