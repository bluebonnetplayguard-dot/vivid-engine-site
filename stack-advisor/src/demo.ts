import { SEED } from './seed.ts';
import { check_edge, check_stack } from './tools.ts';
const NOW = new Date('2026-10-23');
console.log(JSON.stringify(check_edge(SEED, 'LlamaIndex', 'Qdrant', NOW), null, 2));
console.log(JSON.stringify(check_stack(SEED, ['LlamaIndex', 'Qdrant', 'Ollama'], NOW, { kind: 'rag' }), null, 2));
