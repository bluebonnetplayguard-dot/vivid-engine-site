import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Loads the 3D Studio's own command code (site/src/modules/gc-3d-design-studio/core: plain ES modules, no
// browser APIs) so the server applies studio commands with exactly the code the browser runs: one
// implementation, no drift. The Docker image copies that folder to /app/studio-core (see Dockerfile);
// in development and tests it is read from the repository. STUDIO_CORE_DIR overrides both.

export interface StudioCore {
  applyModelCommand(model: unknown, cmd: Record<string, unknown>, ctx?: { selection?: string | null }): { model: any; changes?: string[]; ids?: string[]; error?: string };
  applyAll(model: unknown, cmds: Record<string, unknown>[], ctx?: { selection?: string | null }): { model: any; changes: string[]; ids?: string[]; error?: string };
}

const CANDIDATES = [
  process.env.STUDIO_CORE_DIR,
  '/app/studio-core',
  resolve(__dirname, '../../../../site/src/modules/gc-3d-design-studio/core'),   // dist/ai-commands/router → repo
  resolve(__dirname, '../../../../../site/src/modules/gc-3d-design-studio/core'),
].filter((d): d is string => !!d);

// tsc compiles import() to require() under CommonJS; this keeps a real dynamic import for the ES modules.
const dynamicImport = new Function('url', 'return import(url)') as (url: string) => Promise<any>;

let loaded: Promise<StudioCore> | null = null;

export function studioCoreDir(): string | null {
  return CANDIDATES.find(d => existsSync(join(d, 'commands.js'))) ?? null;
}

export function loadStudioCore(): Promise<StudioCore> {
  loaded ??= (async () => {
    const dir = studioCoreDir();
    if (!dir) throw new Error('The 3D Studio command code (studio-core) is not installed on this server.');
    const mod = await dynamicImport(pathToFileURL(join(dir, 'commands.js')).href);
    if (typeof mod.applyModelCommand !== 'function' || typeof mod.applyAll !== 'function') throw new Error('studio-core is missing applyModelCommand/applyAll.');
    return { applyModelCommand: mod.applyModelCommand, applyAll: mod.applyAll };
  })();
  loaded.catch(() => { loaded = null; });
  return loaded;
}
