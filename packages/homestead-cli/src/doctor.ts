import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve, sep } from 'node:path';
import { loadProject } from './project.ts';
import { findRuntime, resolveServerModule } from './runtime.ts';
import { keyPermsAreLocked, resolveKeyLocation } from './key.ts';

type Status = 'ok' | 'warn' | 'fail';
export interface Check {
  name: string;
  status: Status;
  detail: string;
}

export interface DoctorOptions {
  projectDir: string;
  frontendPort: number;
}

/** Run the read-only self-checks for `homestead start`. */
export async function runDoctor(opts: DoctorOptions): Promise<Check[]> {
  const checks: Check[] = [];
  checks.push(platformCheck());
  checks.push(runtimeCheck(opts.projectDir));
  checks.push(await portCheck('app port', opts.frontendPort));
  checks.push(projectCheck(opts.projectDir));
  checks.push(depsCheck(opts.projectDir));
  checks.push(masterKeyCheck(opts.projectDir));
  return checks;
}

export function hasFailures(checks: Check[]): boolean {
  return checks.some((c) => c.status === 'fail');
}

function platformCheck(): Check {
  const plat = `${process.platform}/${process.arch}`;
  if (process.platform === 'darwin' || process.platform === 'linux') {
    return { name: 'platform', status: 'ok', detail: plat };
  }
  return {
    name: 'platform',
    status: 'warn',
    detail: `${plat} — only macOS + Linux are validated`,
  };
}

function runtimeCheck(projectDir: string): Check {
  try {
    return { name: 'runtime', status: 'ok', detail: findRuntime(projectDir).label };
  } catch (err) {
    return {
      name: 'runtime',
      status: 'fail',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

function portCheck(name: string, port: number): Promise<Check> {
  return new Promise((resolvePromise) => {
    const srv = createServer();
    srv.once('error', () => {
      resolvePromise({
        name,
        status: 'fail',
        detail: `:${port} is in use`,
      });
    });
    srv.once('listening', () => {
      srv.close(() =>
        resolvePromise({ name, status: 'ok', detail: `:${port} is free` }),
      );
    });
    srv.listen(port, '127.0.0.1');
  });
}

function projectCheck(dir: string): Check {
  try {
    const project = loadProject(dir);
    return { name: 'project', status: 'ok', detail: project.configPath };
  } catch (err) {
    return {
      name: 'project',
      status: 'warn',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Encryption-at-rest key hygiene. Encryption is opt-in, so an absent key is a
 * warning (not a failure); a key inside the data dir is a failure because it
 * would be captured by backups and defeat the whole scheme.
 */
function masterKeyCheck(dir: string): Check {
  const loc = resolveKeyLocation();
  if (loc.source === 'none') {
    const fields = encryptedFieldsOf(dir);
    return {
      name: 'encryption',
      status: 'warn',
      detail: fields?.length
        ? `no master key, so ${fields.length} encrypted field(s) can't be saved: ${fields.join(', ')} ` +
          '(run `homestead key generate` and restart)'
        : 'no master key — file encryption is OFF (run `homestead key generate` to enable)',
    };
  }
  if (loc.source === 'env') {
    return { name: 'encryption', status: 'ok', detail: 'master key from HOMESTEAD_MASTER_KEY' };
  }

  const keyPath = loc.path!;
  let dataDir: string | undefined;
  try {
    dataDir = loadProject(dir).dataDir;
  } catch {
    // No project here; skip the containment check but still report the key.
  }
  if (dataDir) {
    const p = resolve(dataDir);
    const c = resolve(keyPath);
    if (c === p || c.startsWith(p + sep)) {
      return {
        name: 'encryption',
        status: 'fail',
        detail: `master key ${keyPath} is inside the data dir — backups would capture it; move it out`,
      };
    }
  }
  if (!keyPermsAreLocked(keyPath)) {
    return {
      name: 'encryption',
      status: 'warn',
      detail: `master key ${keyPath} is group/other-readable — chmod 600 it`,
    };
  }
  return { name: 'encryption', status: 'ok', detail: `master key at ${keyPath} (0600)` };
}

/**
 * The encrypted fields the project's database declares, read through the
 * project's homestead-server (`tools/encrypted-fields.ts`) so the launcher
 * carries no engine code. Null when they can't be read (no project, no server
 * installed) — the check then falls back to the plain no-key warning.
 */
function encryptedFieldsOf(dir: string): string[] | null {
  try {
    const { dataDir } = loadProject(dir);
    const tool = resolveServerModule(dir, 'tools', 'encrypted-fields.ts');
    const cmd = findRuntime(dir).run(tool, ['--db', join(dataDir, 'aepbase.db')]);
    const result = spawnSync(cmd[0]!, cmd.slice(1), { cwd: dir, encoding: 'utf8' });
    if (result.error || result.status !== 0) return null;
    const parsed = JSON.parse(result.stdout) as { fields?: unknown };
    return Array.isArray(parsed.fields) ? parsed.fields.filter((f): f is string => typeof f === 'string') : null;
  } catch {
    return null;
  }
}

// The server, SPA shell, and vite all resolve through the project's
// node_modules — the launcher runs them as bun children, nothing is embedded.
function depsCheck(dir: string): Check {
  const serverEntry = join(
    dir,
    'node_modules',
    '@rambleraptor',
    'homestead-server',
    'src',
    'index.ts',
  );
  const viteBin = join(dir, 'node_modules', '.bin', 'vite');
  if (existsSync(serverEntry) && existsSync(viteBin)) {
    return { name: 'dependencies', status: 'ok', detail: 'node_modules has server + vite' };
  }
  return {
    name: 'dependencies',
    status: 'warn',
    detail: 'homestead-server/vite missing from node_modules — `homestead start` will install them',
  };
}
