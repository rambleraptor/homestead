import { readFileSync } from 'node:fs';
import type { Resource } from '@aep_dev/aep-lib-ts';
import {
  connect,
  type ConnectOptions,
  type CustomMethodInfo,
  type ResourceContext,
} from './resources-model.ts';
import {
  buildBody,
  buildItemPath,
  collectParentParams,
  fieldFlags,
  FlagError,
  parentPlaceholders,
  DATA_FLAG,
  ID_FLAG,
  type RawFlags,
} from './resources-flags.ts';
import { CUSTOM_METHOD_FLAGS, runCustomMethod, type RepeatedFlags } from './resources-custom.ts';
import {
  customMethodsFor,
  renderIndex,
  renderResourceHelp,
  supportedVerbs,
  type Verb,
} from './resources-help.ts';

/** Flags consumed by connect/output rather than treated as resource fields. */
const GLOBAL_FLAGS = [
  'server-url',
  'port',
  'profile',
  'token',
  'email',
  'password',
  'output',
];

const ctx = {};

/**
 * `homestead resources [<resource> [<verb> [<id>]]]` — dynamic CRUD/List over
 * whatever a running aepbase serves. With no resource it prints the index;
 * with a resource but no verb it prints that resource's help.
 */
export async function resourcesCmd(args: string[]): Promise<number> {
  const { flags, positionals, repeated } = parseFlags(args);
  const [resourceName, verbArg, idArg] = positionals;

  let model: ResourceContext;
  try {
    model = await connect(connectOptions(flags));
  } catch (err) {
    return fail(err, 1);
  }

  if (!resourceName) {
    console.log(renderIndex(model.resources, model.customMethods));
    return 0;
  }

  const resource = resolveResource(model.resources, resourceName);
  if (!resource) {
    console.error(unknownResourceMessage(model.resources, resourceName));
    return 1;
  }

  if (!verbArg) {
    console.log(renderResourceHelp(resource, model.customMethods));
    return 0;
  }

  const crudVerbs = supportedVerbs(resource);
  const custom = customMethodsFor(resource, model.customMethods).find(
    (m) => m.verb === verbArg,
  );
  if (!crudVerbs.includes(verbArg as Verb) && !custom) {
    const supported = [
      ...crudVerbs,
      ...customMethodsFor(resource, model.customMethods).map((m) => m.verb),
    ];
    console.error(
      `resource "${resource.singular}" has no "${verbArg}" verb — supported: ${supported.join(', ') || '(none)'}`,
    );
    return 1;
  }

  try {
    const result = custom
      ? await runCustom(model, resource, custom, idArg, flags, repeated)
      : await runVerb(model, resource, verbArg as Verb, idArg, flags);
    if (result !== undefined) console.log(JSON.stringify(result, null, 2));
    return 0;
  } catch (err) {
    // Usage problems (bad/missing flags) are the operator's fault → 1;
    // anything else is an aepbase/HTTP failure → 2 (aepcli convention).
    return fail(err, err instanceof FlagError ? 1 : 2);
  }
}

/**
 * Invoke an AEP-136 custom method on `resource`: `POST /api/aep/<plural>[/<id>]:<verb>`
 * through the shared client (see `./resources-custom`). The body comes from
 * `--@data`, files from `--upload field=path`; bulk import/export have their own flags.
 */
async function runCustom(
  model: ResourceContext,
  resource: Resource,
  method: CustomMethodInfo,
  idArg: string | undefined,
  flags: RawFlags,
  repeated: RepeatedFlags,
): Promise<unknown> {
  const parentParams = collectParentParams(resource, flags);
  let resourcePath: string;
  if (method.target === 'item') {
    if (!idArg) {
      throw new FlagError(
        `"${method.verb}" is a per-record method — pass an id: ` +
          `homestead resources ${resource.singular} ${method.verb} <id>`,
      );
    }
    resourcePath = buildItemPath(resource, parentParams, idArg).replace(/^\//, '');
  } else {
    resourcePath = buildCollectionPath(resource, parentParams);
  }
  const body = readCustomMethodBody(flags);
  if (body !== undefined && (typeof body !== 'object' || body === null || Array.isArray(body))) {
    throw new FlagError('--@data must hold a JSON object');
  }
  return runCustomMethod(model, method, resourcePath, body as Record<string, unknown> | undefined, flags, repeated);
}

/** Collection path for a (possibly nested) resource: drop the trailing id. */
function buildCollectionPath(
  resource: Resource,
  parentParams: Record<string, string>,
): string {
  const elems = resource.patternElems;
  const parts: string[] = [];
  for (let i = 0; i < elems.length - 1; i++) {
    if (i % 2 === 0) {
      parts.push(elems[i]);
      continue;
    }
    const name = elems[i].slice(1, -1);
    const value = parentParams[name];
    if (!value) throw new FlagError(`missing id for ${name}`);
    parts.push(value);
  }
  return parts.join('/');
}

/** The custom-method request body comes from `--@data <file.json>`. */
function readCustomMethodBody(flags: RawFlags): unknown {
  const data = flags[DATA_FLAG];
  if (data === undefined) return undefined;
  if (typeof data !== 'string') {
    throw new FlagError('--@data needs a path to a JSON file');
  }
  let raw: string;
  try {
    raw = readFileSync(data, 'utf8');
  } catch {
    throw new FlagError(`cannot read --@data file: ${data}`);
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new FlagError(`--@data file is not valid JSON: ${data}`);
  }
}

async function runVerb(
  model: ResourceContext,
  resource: Resource,
  verb: Verb,
  idArg: string | undefined,
  flags: RawFlags,
): Promise<unknown> {
  const { client, serverUrl } = model;
  const parentParams = collectParentParams(resource, flags);
  const reserved = reservedFlags(resource);

  switch (verb) {
    case 'list':
      return client.list(ctx, resource, serverUrl, parentParams);
    case 'get':
      return client.get(ctx, serverUrl, buildItemPath(resource, parentParams, requireId(idArg, verb)));
    case 'delete': {
      const path = buildItemPath(resource, parentParams, requireId(idArg, verb));
      await client.delete(ctx, serverUrl, path);
      return { deleted: path };
    }
    case 'create': {
      const body = buildBody(resource, fieldFlags(resource), flags, { forCreate: true, reserved });
      return client.create(ctx, resource, serverUrl, body, parentParams);
    }
    case 'update': {
      const path = buildItemPath(resource, parentParams, requireId(idArg, verb));
      const body = buildBody(resource, fieldFlags(resource), flags, { forCreate: false, reserved });
      return client.update(ctx, serverUrl, path, body);
    }
  }
}

function requireId(idArg: string | undefined, verb: Verb): string {
  if (!idArg) throw new FlagError(`"${verb}" needs an id: homestead resources <resource> ${verb} <id>`);
  return idArg;
}

/** Body-field flags are everything except globals, parents, --@data and --id. */
function reservedFlags(resource: Resource): Set<string> {
  return new Set([
    ...GLOBAL_FLAGS,
    ...CUSTOM_METHOD_FLAGS,
    ...parentPlaceholders(resource),
    DATA_FLAG,
    ID_FLAG,
  ]);
}

function connectOptions(flags: RawFlags): ConnectOptions {
  return {
    serverUrl: str(flags['server-url']),
    port: num(flags['port']),
    profile: str(flags['profile']),
    token: str(flags.token),
    email: str(flags.email),
    password: str(flags.password),
  };
}

/** Resolve a name (singular or plural) to its resource. */
function resolveResource(
  resources: Record<string, Resource>,
  name: string,
): Resource | undefined {
  for (const r of Object.values(resources)) {
    if (r.singular === name || r.plural === name) return r;
  }
  return undefined;
}

function unknownResourceMessage(
  resources: Record<string, Resource>,
  name: string,
): string {
  const names = Object.values(resources).map((r) => r.singular);
  const near = names.filter((n) => n.includes(name) || name.includes(n));
  const hint = near.length > 0 ? ` Did you mean: ${near.join(', ')}?` : '';
  return `unknown resource "${name}".${hint} Run \`homestead resources\` to list them.`;
}

function fail(err: unknown, code: number): number {
  const raw = err instanceof Error ? err.message : String(err);
  // aep-lib-ts client errors are "Request failed: <body> for request <config>"
  // — the trailing config echoes our bearer token, so drop it.
  const message = raw.replace(/ for request \{.*$/s, '');
  console.error(message);
  return code;
}

interface ParsedFlags {
  flags: RawFlags;
  positionals: string[];
  /** Every value of each flag, in order (for `--file`, `--upload`). */
  repeated: RepeatedFlags;
}

/** Minimal flag parser: --flag, --flag=value, --flag value (mirrors cli.ts). */
export function parseFlags(args: string[]): ParsedFlags {
  const flags: RawFlags = {};
  const repeated: RepeatedFlags = {};
  const positionals: string[] = [];
  const set = (name: string, value: string | boolean) => {
    flags[name] = value;
    if (typeof value === 'string') (repeated[name] ??= []).push(value);
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('--')) {
      positionals.push(a);
      continue;
    }
    const eq = a.indexOf('=');
    // `--upload=image=./list.png` splits at the first `=` only.
    if (eq !== -1) {
      set(a.slice(2, eq), a.slice(eq + 1));
      continue;
    }
    const name = a.slice(2);
    const next = args[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      set(name, next);
      i++;
    } else {
      set(name, true);
    }
  }
  return { flags, positionals, repeated };
}

function str(v: string | boolean | undefined): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function num(v: string | boolean | undefined): number | undefined {
  if (typeof v !== 'string') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
