/**
 * The chat assistant's semantic-search tool over embedded file fields.
 *
 * Auto-registered (only) when some resource has an `ai.embed` file field and an
 * embedding provider is configured — so it lights up with no per-app wiring, the
 * same way the CRUD tools derive from resource defs. It embeds the user's
 * question, finds the nearest chunks in the vector store, and returns passages
 * with citations for the model to quote.
 *
 * The vector index has no row-level scoping, so a raw hit could reference a
 * record the caller can't see. Every hit is therefore re-fetched under the
 * caller's own token — inaccessible records are dropped — so search can never
 * surface more than the user could read directly.
 */

import { z } from 'zod';
import { serverClient } from '../client';
import { getEmbeddingModelId, isEmbeddingConfigured } from '../ai/config';
import { aiEmbed, tool } from '../ai/generate';
import { fileEmbeds } from '../../resources/ai-fields';
import { referenceFields, referenceId } from '../../resources/references';
import type { ResourceDefinition } from '../../resources/types';
import { getVectorStore } from '../vectors/store';
import type { ChatToolCall } from '../../chat/types';

/** Built-in user root — searchable resources may reference it (`created_by`). */
const USER_PLURAL = 'users';

/** A reference to resolve on a search hit: the field, target plural + singular. */
interface RefSpec {
  field: string;
  resource: string;
  plural: string;
  isArray: boolean;
}

/** A reference resolved to its target's display label (when it has one). */
interface ResolvedReference {
  field: string;
  resource: string;
  id: string;
  label?: string;
}

/** The tool's exposed name, referenced by the system prompt. */
export const SEARCH_TOOL_NAME = 'search_documents';

const MAX_LIMIT = 10;
const DEFAULT_LIMIT = 5;
/** Over-fetch candidates so access-filtering can still fill `limit`. */
const CANDIDATE_FACTOR = 4;

/** Top-level resources with at least one embedded file field. */
function embeddedResources(defs: ResourceDefinition[]): ResourceDefinition[] {
  return defs.filter(
    (def) => !def.parents?.length && Object.values(def.fields).some(fileEmbeds),
  );
}

/** A resource's display title from a fetched record, if it has one. */
function pickTitle(record: unknown): string | undefined {
  if (!record || typeof record !== 'object') return undefined;
  const r = record as {
    title?: unknown;
    name?: unknown;
    display_name?: unknown;
    email?: unknown;
  };
  if (typeof r.title === 'string' && r.title) return r.title;
  if (typeof r.name === 'string' && r.name) return r.name.split('/').filter(Boolean).pop();
  // Users carry no title/name; fall back to their display name, then email.
  if (typeof r.display_name === 'string' && r.display_name) return r.display_name;
  if (typeof r.email === 'string' && r.email) return r.email;
  return undefined;
}

/**
 * Build the search tool, or return null when it shouldn't exist (no embedded
 * resources, or embedding/vector store unconfigured). `record` captures the
 * call for the response's `toolCalls`, matching the CRUD tools.
 */
export function makeSearchTool(opts: {
  defs: ResourceDefinition[];
  token: string;
  record: (call: ChatToolCall) => void;
}) {
  const resources = embeddedResources(opts.defs);
  if (resources.length === 0 || !isEmbeddingConfigured() || !getVectorStore()) {
    return null;
  }

  const plurals = resources.map((d) => d.plural);
  const pluralToSingular = new Map(resources.map((d) => [d.plural, d.singular]));
  const singularToPlural = new Map(resources.map((d) => [d.singular, d.plural]));

  // Reference fields to resolve per searchable resource, limited to targets we
  // can fetch by id alone (top-level, incl. the built-in `user`). Non-embedded
  // targets (e.g. `person`) are reachable through the full def list.
  const pluralOfTarget = new Map<string, string>(opts.defs.map((d) => [d.singular, d.plural]));
  pluralOfTarget.set('user', USER_PLURAL);
  const parentedTargets = new Set(
    opts.defs.filter((d) => d.parents?.length).map((d) => d.singular),
  );
  const refsBySingular = new Map<string, RefSpec[]>();
  for (const def of resources) {
    const specs = referenceFields(def)
      .filter((fr) => pluralOfTarget.has(fr.resource) && !parentedTargets.has(fr.resource))
      .map((fr) => ({
        field: fr.field,
        resource: fr.resource,
        plural: pluralOfTarget.get(fr.resource)!,
        isArray: fr.isArray,
      }));
    if (specs.length) refsBySingular.set(def.singular, specs);
  }

  const resourcesParam = z
    .array(z.enum(plurals as [string, ...string[]]))
    .optional()
    .describe('Restrict the search to these resource types. Omit to search all.');

  const inputSchema = z.object({
    query: z.string().describe('The natural-language question or topic to search for.'),
    resources: resourcesParam,
    limit: z
      .number()
      .int()
      .optional()
      .describe(`Max passages to return (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}).`),
  });

  return tool({
    description:
      'Search the full text of uploaded files (' +
      plurals.join(', ') +
      ') by meaning, not just keywords. Use this to answer questions about the ' +
      'contents of documents. Returns matching passages with a citation (the ' +
      'resource type and record id) you should reference in your answer, plus ' +
      'any linked records (e.g. the uploader) resolved to their names.',
    inputSchema,
    execute: async (args: z.infer<typeof inputSchema>) => {
      const { query } = args;
      const hs = serverClient(opts.token);
      const limit = Math.min(Math.max(args.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
      const store = getVectorStore();
      if (!store) {
        const out = { error: 'Document search is not available.' };
        opts.record({ tool: SEARCH_TOOL_NAME, args, ok: false, error: out.error });
        return out;
      }

      const wantSingulars = args.resources
        ?.map((p) => pluralToSingular.get(p))
        .filter((s): s is string => Boolean(s));

      const [vector] = await aiEmbed([query]);
      const hits = await store.search({
        vector,
        // The query uses the instance-default embedding model, so it can only
        // match vectors that model produced. Fields pinned to a different model
        // via `ai.embed.embedding_model` are intentionally not searched here.
        model: getEmbeddingModelId(),
        limit: limit * CANDIDATE_FACTOR,
        resources: wantSingulars,
      });

      // Resolve one reference id → its target's display label, caching across
      // hits so a repeated creator/person is fetched once.
      const labelCache = new Map<string, string | undefined>();
      const resolveLabel = async (plural: string, id: string): Promise<string | undefined> => {
        const ck = `${plural}/${id}`;
        if (labelCache.has(ck)) return labelCache.get(ck);
        let label: string | undefined;
        try {
          label = pickTitle(await hs.collection(plural).get(referenceId(id, plural)));
        } catch {
          label = undefined; // inaccessible target — leave the id unlabeled
        }
        labelCache.set(ck, label);
        return label;
      };

      // A hit record's references, resolved to labels for the model to connect
      // the document to the entities it points at (e.g. its uploader).
      const resolveReferences = async (
        singular: string,
        record: unknown,
      ): Promise<ResolvedReference[] | undefined> => {
        const specs = refsBySingular.get(singular);
        if (!specs || !record || typeof record !== 'object') return undefined;
        const fields = record as Record<string, unknown>;
        const out: ResolvedReference[] = [];
        for (const spec of specs) {
          const raw = fields[spec.field];
          const ids = spec.isArray ? (Array.isArray(raw) ? raw : []) : [raw];
          for (const id of ids) {
            if (typeof id !== 'string' || id.length === 0) continue;
            const label = await resolveLabel(spec.plural, id);
            out.push({ field: spec.field, resource: spec.resource, id, ...(label ? { label } : {}) });
          }
        }
        return out.length ? out : undefined;
      };

      // Verify access once per record (a doc can contribute several chunks).
      const accessCache = new Map<
        string,
        { title?: string; references?: ResolvedReference[] } | null
      >();
      const results: Array<{
        resource: string;
        id: string;
        field: string;
        title?: string;
        references?: ResolvedReference[];
        passage: string;
        score: number;
      }> = [];

      for (const hit of hits) {
        if (results.length >= limit) break;
        const plural = singularToPlural.get(hit.resource);
        if (!plural) continue;
        const key = `${plural}/${hit.record}`;
        let rec = accessCache.get(key);
        if (rec === undefined) {
          try {
            const record = await hs.collection(plural).get(hit.record);
            rec = {
              title: pickTitle(record),
              references: await resolveReferences(hit.resource, record),
            };
          } catch {
            rec = null; // inaccessible or gone — drop from results
          }
          accessCache.set(key, rec);
        }
        if (rec === null) continue;
        results.push({
          resource: plural,
          id: hit.record,
          field: hit.field,
          title: rec.title,
          references: rec.references,
          passage: hit.text,
          score: Number(hit.score.toFixed(4)),
        });
      }

      opts.record({
        tool: SEARCH_TOOL_NAME,
        args,
        ok: true,
        result: { count: results.length },
      });
      return { results };
    },
  });
}
