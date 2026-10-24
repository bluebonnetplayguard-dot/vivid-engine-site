// MOCK SEED DATA for development only. Every evidence record is flagged mock:true and the API says so.
// Real records come from the collectors (npm, PyPI, GitHub, Hugging Face, MCP registry, OSV).
import type { Db, Tool } from './types';
const t = (o: Partial<Tool> & Pick<Tool,'id'|'name'|'category'|'license'>): Tool => ({
  description: '', languages: [], selfHost: true, cloud: false, pricing: 'free / open source', commercialUseOk: true, ...o });
export const SEED: Db = {
  tools: [
    t({ id: 'llamaindex', name: 'LlamaIndex', category: 'framework', license: 'MIT', languages: ['python','typescript'], runtime: { python: '>=3.9' }, description: 'Framework for connecting data to language models (retrieval, indexing, agents).' }),
    t({ id: 'langchain', name: 'LangChain', category: 'framework', license: 'MIT', languages: ['python','typescript'], runtime: { python: '>=3.9' }, description: 'Framework for building applications with language models and tools.' }),
    t({ id: 'qdrant', name: 'Qdrant', category: 'vector-db', license: 'Apache-2.0', languages: ['rust'], cloud: true, pricing: 'open source; paid cloud', description: 'Vector database for similarity search.' }),
    t({ id: 'chroma', name: 'Chroma', category: 'vector-db', license: 'Apache-2.0', languages: ['python'], runtime: { python: '>=3.9' }, description: 'Embedded and server vector database.' }),
    t({ id: 'weaviate', name: 'Weaviate', category: 'vector-db', license: 'BSD-3-Clause', languages: ['go'], cloud: true, pricing: 'open source; paid cloud', description: 'Vector database with hybrid search.' }),
    t({ id: 'ollama', name: 'Ollama', category: 'model-runtime', license: 'MIT', languages: ['go'], description: 'Runs open language models locally. Model licenses vary and are separate.' }),
    t({ id: 'llama-model', name: 'Example open-weight model', category: 'llm', license: 'custom-community', commercialUseOk: false, description: 'Placeholder for a model with a restrictive community license.' }),
    t({ id: 'gpl-tool', name: 'Example GPL component', category: 'library', license: 'GPL-3.0-only', copyleft: true, description: 'Placeholder copyleft component for license-rule tests.' }),
  ],
  edges: [
    { a: 'llamaindex', b: 'qdrant', type: 'official-integration', evidence: [
      { tier: 'verified', method: 'lab', date: '2026-10-10', source: 'https://example.invalid/lab/logs/llamaindex-qdrant-001', result: 'pass', notes: 'Indexed 10 docs, queried, relevant results returned.', versions: { llamaindex: 'MOCK 0.x', qdrant: 'MOCK 1.x' }, mock: true },
      { tier: 'checked', method: 'cross-check', date: '2026-10-18', source: 'https://example.invalid/checks/llamaindex-qdrant', result: 'pass', notes: 'Integration package exists on PyPI; docs page names Qdrant.', mock: true } ] },
    { a: 'llamaindex', b: 'ollama', type: 'official-integration', evidence: [
      { tier: 'verified', method: 'lab', date: '2026-08-20', source: 'https://example.invalid/lab/logs/llamaindex-ollama-004', result: 'pass', notes: 'Local model answered over indexed docs.', mock: true } ] },
    { a: 'llamaindex', b: 'chroma', type: 'official-integration', evidence: [
      { tier: 'verified', method: 'lab', date: '2026-10-15', source: 'https://example.invalid/lab/logs/llamaindex-chroma-002', result: 'fail', notes: 'Failed on MOCK v2.3: import error.', mock: true },
      { tier: 'checked', method: 'cross-check', date: '2026-10-12', source: 'https://example.invalid/checks/llamaindex-chroma', result: 'pass', notes: 'Package exists; docs name Chroma.', mock: true } ] },
    { a: 'langchain', b: 'qdrant', type: 'official-integration', evidence: [
      { tier: 'indexed', method: 'registry', date: '2026-10-01', source: 'https://example.invalid/registry/langchain-qdrant', result: 'pass', notes: 'Listed in package registry metadata; not yet cross-checked.', mock: true } ] },
  ],
};
