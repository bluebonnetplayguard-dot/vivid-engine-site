// Structured building model: schema (zod + JSON Schema), typed model class, relationships and validation.
// Everything downstream (geometry reader, takeoffs, estimates, AI commands, blueprint conversion) reads models
// through this module.
export * from './schema';
export * from './model';
export * from './validate';
