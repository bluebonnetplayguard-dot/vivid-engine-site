// AI command vocabulary (schema + registry), validators and the natural-language interpreter. See docs/AI-COMMANDS.md.
export * from './command-schema';
export * from './validators';
export * from './dimension-guard';
export * from './interpreter';
export type { CommandModel, ModelAnswer } from './claude-interpreter';
