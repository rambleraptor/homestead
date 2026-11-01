/**
 * OpenAPI 3.1 generation matching the Go server's output shape (aep-lib-go's
 * ConvertToOpenAPI + the enrichment passes in pkg/aepbase). The document is
 * consumed by `homestead resources` via aep-lib-ts's APIClient.fromOpenAPI,
 * which needs: per-path operations with `200` responses holding `$ref`
 * schemas, a `results` array in list responses, `skip`/`filter`/`id`
 * parameter names, and `components.schemas[*]["x-aep-resource"]`.
 *
 * The create operation declares a 201 response, which now matches what the
 * runtime returns (AEP-133) — it is no longer a doc-only quirk. Note that
 * aep-lib-ts v0.0.2 only wires up create when the POST declares a 200, so
 * `homestead resources` still re-derives create from the raw path
 * (`patchCreateMethods`); that compensation is unaffected by the runtime code.
 *
 * One quirk still copied from Go on purpose: operation descriptions use a
 * camelCased singular ("Creates a new giftCard.").
 */

import type { RegisteredResource, Registry } from './registry';
import { linksOf } from './links';
import type { Schema, SchemaProperty } from './types';
import { isSecretProperty } from './encrypted-fields';

type Json = Record<string, unknown>;

function pascal(singular: string): string {
  return singular
    .split('-')
    .map((p) => (p ? p[0]!.toUpperCase() + p.slice(1) : p))
    .join('');
}

function camel(singular: string): string {
  const p = pascal(singular);
  return p ? p[0]!.toLowerCase() + p.slice(1) : p;
}

const STANDARD_FIELD_META: Record<string, { description: string; example: unknown }> = {
  id: {
    description: 'The unique identifier for this resource.',
    example: 'my-aep-resource-definition',
  },
  path: {
    description: 'The full resource path (e.g. publishers/acme/books/1984).',
    example: 'aep-resource-definitions/my-aep-resource-definition',
  },
  create_time: {
    description: 'The time this resource was created.',
    example: '2024-01-01T00:00:00Z',
  },
  update_time: {
    description: 'The time this resource was last updated.',
    example: '2024-06-15T12:00:00Z',
  },
};

const PARAM_META: Record<string, { description: string; example: unknown }> = {
  max_page_size: {
    description: 'The maximum number of results to return per page.',
    example: 25,
  },
  page_token: {
    description: 'A token from a previous list response to fetch the next page.',
    example: 'eyJsYXN0X2lkIjoiMTIzIn0=',
  },
  skip: { description: 'The number of results to skip before returning.', example: 0 },
  filter: {
    description: 'A filter expression to narrow results (e.g. "author=Orwell").',
    example: 'author=Orwell',
  },
  order_by: {
    description:
      'A comma-separated list of fields to sort by, ascending by default; ' +
      'prefix a field with "-" for descending (e.g. "author,-create_time").',
    example: '-create_time',
  },
  id: {
    description:
      'The ID to use for the new resource definition. If omitted, one is generated automatically.',
    example: 'my-aep-resource-definition',
  },
  force: {
    description: 'If true, delete even if child resources exist.',
    example: false,
  },
};

function queryParam(name: string, type: string): Json {
  const meta = PARAM_META[name];
  return {
    name,
    in: 'query',
    schema: { type },
    ...(meta ? { description: meta.description, example: meta.example } : {}),
  };
}

/**
 * `include`: linked records to bring along (`./include`), each under the
 * record's `$included`. Its values are this resource's link names.
 */
function includeParam(links: string[]): Json {
  return {
    name: 'include',
    in: 'query',
    style: 'form',
    explode: false,
    schema: { type: 'array', items: { type: 'string', enum: links } },
    description:
      'Linked records to return beside each record, under "$included" (comma-separated, at most 3). ' +
      'A link to one record gives it or null; others give { results, more }, cut at 25.',
  };
}

function pathParam(name: string): Json {
  const resName = name.replace(/_id$/, '');
  return {
    name,
    in: 'path',
    required: true,
    schema: { type: 'string' },
    description: `The ID of the ${resName}.`,
    example: `my-${resName}`,
  };
}

function errorResponseSchema(): Json {
  return {
    type: 'object',
    properties: {
      error: {
        type: 'object',
        description: 'Error details.',
        properties: {
          code: { type: 'integer', description: 'The HTTP status code.', example: 400 },
          message: {
            type: 'string',
            description: 'A human-readable error message.',
            example: 'something went wrong',
          },
        },
        example: { code: 400, message: 'something went wrong' },
      },
    },
  };
}

function errResp(code: number, description: string, message: string): Json {
  return {
    description,
    content: {
      'application/json': {
        schema: errorResponseSchema(),
        example: { error: { code, message } },
      },
    },
  };
}

function successRef(singular: string, example?: Json): Json {
  return {
    description: 'Successful response',
    content: {
      'application/json': {
        schema: { $ref: `#/components/schemas/${singular}` },
        ...(example ? { example } : {}),
      },
    },
  };
}

interface ResourceDoc {
  singular: string;
  plural: string;
  parents: string[];
  schema: Schema;
  description: string;
  examples: Record<string, unknown>;
  singleton: boolean;
  userSettableId: boolean;
  fileFields: Set<string>;
  /** Top-level fields with files below them (see `./file-entries`). */
  nestedFileFields: Set<string>;
  patternElems: string[];
  /** Children make delete advertise a `force` query param (aep-lib-go shape). */
  hasChildren: boolean;
  /** Link names `include` accepts on get and list (`./links`); none, no param. */
  links?: string[];
  /** Which CRUD methods the resource exposes. */
  methods: {
    list?: { supportsSkipFilter: boolean };
    create?: boolean;
    get?: boolean;
    update?: boolean;
    delete?: boolean;
    apply?: boolean;
  };
}

/** The built-in /aep-resource-definitions pseudo-resource. */
function metaResourceDoc(): ResourceDoc {
  return {
    singular: 'aep-resource-definition',
    plural: 'aep-resource-definitions',
    parents: [],
    schema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          readOnly: true,
          description: 'The unique identifier for this resource definition.',
        },
        path: {
          type: 'string',
          readOnly: true,
          description: 'The full resource path (e.g. aep-resource-definitions/book).',
        },
        singular: {
          type: 'string',
          description: 'The singular name of the resource (e.g. book).',
        },
        plural: {
          type: 'string',
          description:
            'The plural name of the resource, used as the URL collection path (e.g. books).',
        },
        description: { type: 'string', description: 'A human-readable description of the resource.' },
        examples: {
          type: 'object',
          description: "Example values for the resource's fields, keyed by field name.",
        },
        schema: {
          type: 'object',
          description: "The JSON Schema defining the resource's properties.",
        },
        parents: {
          type: 'array',
          items: { type: 'string' },
          description: 'The singular names of parent resources for nested resources.',
        },
        user_settable_create: {
          type: 'boolean',
          description: 'Whether clients can set the resource ID on creation.',
        },
        create_time: {
          type: 'string',
          format: 'date-time',
          readOnly: true,
          description: 'The time this resource definition was created.',
        },
        update_time: {
          type: 'string',
          format: 'date-time',
          readOnly: true,
          description: 'The time this resource definition was last updated.',
        },
      },
    },
    description:
      'A resource definition. Create these to dynamically add new API endpoints.',
    examples: {
      singular: 'book',
      plural: 'books',
      description: 'A book published by a publisher.',
      schema: {
        type: 'object',
        properties: { title: { type: 'string' }, author: { type: 'string' } },
      },
    },
    singleton: false,
    userSettableId: false,
    fileFields: new Set(),
    nestedFileFields: new Set(),
    patternElems: ['aep-resource-definitions', '{aep_resource_definition_id}'],
    hasChildren: false,
    methods: {
      list: { supportsSkipFilter: false },
      create: true,
      get: true,
      update: true,
      delete: true,
    },
  };
}

function registeredToDoc(r: RegisteredResource, hasChildren: boolean, links: string[]): ResourceDoc {
  return {
    ...(links.length > 0 ? { links } : {}),
    singular: r.singular,
    plural: r.plural,
    parents: r.parents,
    schema: r.schema,
    description: r.description,
    examples: r.examples,
    singleton: r.singleton,
    userSettableId: r.userSettableId,
    fileFields: r.fileFields,
    nestedFileFields: r.nestedFileFields,
    patternElems: r.patternElems,
    hasChildren,
    methods: r.builtin
      ? { list: { supportsSkipFilter: false }, create: true, get: true, update: true, delete: true }
      : r.singleton
        ? { get: true, update: true }
        : {
            list: { supportsSkipFilter: true },
            create: true,
            get: true,
            update: true,
            delete: true,
            apply: true,
          },
  };
}

/**
 * Translate the engine-internal `x-aepbase-reference` marker into the public,
 * AEP-aligned `x-aep-resource-reference` linkage (matching the `aepbase/<name>`
 * type string used by `x-aep-resource`), so a consumer knows a string field
 * holds the id of another resource. Returns null when the property is not a
 * reference.
 */
function referenceAnnotation(prop: SchemaProperty | undefined): Json | null {
  const marker = prop?.['x-aepbase-reference'] as
    | { resource?: string; onDelete?: string }
    | undefined;
  if (!marker || typeof marker !== 'object' || typeof marker.resource !== 'string') {
    return null;
  }
  return {
    type: `aepbase/${marker.resource}`,
    ...(marker.onDelete ? { onDelete: marker.onDelete } : {}),
  };
}

/**
 * Rewrite a property for the public doc: swap the internal reference marker for
 * the AEP-style annotation, recursing into an array's `items` for to-many
 * references. Copies before mutating so the registry's stored schema is
 * untouched.
 */
function withReferenceAnnotation(out: Json, prop: SchemaProperty): void {
  const ref = referenceAnnotation(prop);
  if (ref) {
    delete out['x-aepbase-reference'];
    out['x-aep-resource-reference'] = ref;
  }
  if (prop.type === 'array' && prop.items) {
    const itemRef = referenceAnnotation(prop.items);
    if (itemRef) {
      const items: Json = { ...(prop.items as SchemaProperty) };
      delete items['x-aepbase-reference'];
      items['x-aep-resource-reference'] = itemRef;
      out.items = items;
    }
  }
}

/** What a file below the top level reads as: see `FileDescriptor` in `./file-entries`. */
const FILE_DESCRIPTOR_PROPERTIES: Json = {
  id: { type: 'string', description: 'The file id; download it with {"file": id}.' },
  url: { type: 'string', description: 'The download URL (POST).' },
  name: { type: 'string', description: 'The uploaded filename.' },
  media_type: {
    type: 'string',
    description: 'From the leading bytes where the format is recognizable, else as uploaded.',
  },
  size: { type: 'integer', description: 'Size in bytes.' },
  encrypted: { type: 'boolean', description: 'Whether the file is encrypted at rest.' },
};

/** Replace each file below a property with the descriptor it reads as. */
function withFileDescriptorSchemas(prop: Json): Json {
  if (prop['x-aepbase-file-field'] === true && prop.type === 'binary') {
    const { type: _type, ...rest } = prop;
    return {
      ...rest,
      type: 'object',
      properties: FILE_DESCRIPTOR_PROPERTIES,
      description:
        (typeof rest.description === 'string' ? `${rest.description} ` : '') +
        'Write {"$upload": "<part name>"} for a new file, {"$file": "<id>"} to keep one, or null.',
    };
  }
  const out: Json = { ...prop };
  if (prop.items && typeof prop.items === 'object') out.items = withFileDescriptorSchemas(prop.items as Json);
  if (prop.properties && typeof prop.properties === 'object') {
    out.properties = Object.fromEntries(
      Object.entries(prop.properties as Record<string, Json>).map(([k, v]) => [k, withFileDescriptorSchemas(v)]),
    );
  }
  return out;
}

/** What a secret reads as: see `SecretDescriptor` in `./secret-fields`. */
const SECRET_DESCRIPTOR_PROPERTIES: Json = {
  $secret: { type: 'boolean', description: "Always true: marks a secret's descriptor." },
  set: { type: 'boolean', description: 'Whether a value is stored.' },
  set_time: { type: 'string', format: 'date-time', description: 'When the value was last set, if known.' },
  hint: { type: 'string', description: "The value's last few characters, when the field shows one." },
};

/** A secret property as it reads: its descriptor, never its value. */
function withSecretDescriptorSchema(prop: Json): Json {
  const { type: written, example: _example, ...rest } = prop;
  const article = /^[aeiou]/.test(String(written)) ? 'an' : 'a';
  return {
    ...rest,
    type: 'object',
    properties: SECRET_DESCRIPTOR_PROPERTIES,
    description:
      (typeof rest.description === 'string' ? `${rest.description} ` : '') +
      `Write-only: write ${article} ${String(written)} to set it, null to clear it, or the descriptor (or nothing) to keep it.`,
  };
}

/** Component schema with enriched property metadata + example object. */
function componentSchema(doc: ResourceDoc): Json {
  const properties: Record<string, Json> = {};
  for (const [name, prop] of Object.entries(doc.schema.properties ?? {})) {
    const out: Json = { ...(prop as SchemaProperty) };
    const std = STANDARD_FIELD_META[name];
    if (std) {
      if (!('description' in out)) out.description = std.description;
      if (!('example' in out)) out.example = std.example;
    }
    if (name in doc.examples) out.example = doc.examples[name];
    if (doc.fileFields.has(name)) out['x-aepbase-file-field'] = true;
    withReferenceAnnotation(out, prop as SchemaProperty);
    properties[name] = isSecretProperty(prop as SchemaProperty)
      ? withSecretDescriptorSchema(out)
      : doc.nestedFileFields.has(name)
        ? withFileDescriptorSchemas(out)
        : out;
  }

  const example: Json = {};
  for (const [name, prop] of Object.entries(properties)) {
    if ('example' in prop) example[name] = prop.example;
  }

  const xAep: Json = {
    type: `aepbase/${doc.singular}`,
    singular: doc.singular,
    plural: doc.plural,
    patterns: [doc.patternElems.join('/')],
  };
  if (doc.parents.length > 0) xAep.parents = doc.parents;
  if (doc.singleton) xAep.singleton = true;

  const schema: Json = {
    type: 'object',
    properties,
    'x-aep-resource': xAep,
  };
  if (doc.schema.required && doc.schema.required.length > 0) {
    schema.required = doc.schema.required.filter((n) => !(doc.singleton && n === 'id'));
  }
  if (doc.description) schema.description = doc.description;
  if (Object.keys(example).length > 0) schema.example = example;
  return schema;
}

function parentPathParams(doc: ResourceDoc): Json[] {
  const params: Json[] = [];
  const elems = doc.patternElems;
  for (let i = 1; i + 2 < elems.length; i += 2) {
    params.push(pathParam(elems[i]!.slice(1, -1)));
  }
  return params;
}

function buildPaths(doc: ResourceDoc, schemaExample: Json | undefined): Record<string, Json> {
  const paths: Record<string, Json> = {};
  const name = camel(doc.singular);
  const listPlural = `${name}s`;
  const idParam = doc.patternElems[doc.patternElems.length - 1]!.slice(1, -1);
  const collectionPath = `/${doc.patternElems.slice(0, -1).join('/')}`;
  const resourcePath = `/${doc.patternElems.join('/')}`;
  const parentParams = parentPathParams(doc);

  const notFound = errResp(404, `The ${name} was not found.`, `${name} not found.`);
  const badRequest = errResp(400, 'The request body is invalid.', 'invalid request body');
  const conflict = errResp(
    409,
    `A ${name} with the given ID already exists.`,
    'definition with id "my-aep-resource-definition" already exists',
  );

  if (doc.singleton) {
    // Singletons serve GET/PATCH at the parent path + the singular name.
    const parts: string[] = [];
    for (let i = 0; i + 2 < doc.patternElems.length; i += 1) parts.push(doc.patternElems[i]!);
    const singletonPath = `/${[...parts, doc.singular].join('/')}`;
    paths[singletonPath] = {
      get: {
        operationId: `Get${pascal(doc.singular)}`,
        description: `Retrieves a single ${name} by ID.`,
        tags: [name],
        parameters: parentParams,
        responses: {
          '200': successRef(doc.singular, schemaExample),
          '404': notFound,
        },
      },
      patch: {
        operationId: `Update${pascal(doc.singular)}`,
        description: `Updates an existing ${name} using RFC 7396 JSON Merge Patch: fields present in the body are set, a field sent as null is cleared, omitted fields are left unchanged, and object fields are merged recursively.`,
        tags: [name],
        parameters: parentParams,
        requestBody: {
          description: `The fields to update on the ${name}.`,
          required: true,
          content: {
            'application/merge-patch+json': {
              schema: { $ref: `#/components/schemas/${doc.singular}` },
            },
          },
        },
        responses: {
          '200': successRef(doc.singular, schemaExample),
          '400': badRequest,
          '404': notFound,
        },
      },
    };
    return paths;
  }

  const collectionOps: Json = {};
  if (doc.methods.list) {
    const listParams: Json[] = [
      ...parentParams,
      queryParam('max_page_size', 'integer'),
      queryParam('page_token', 'string'),
    ];
    if (doc.methods.list.supportsSkipFilter) {
      listParams.push(
        queryParam('skip', 'integer'),
        queryParam('filter', 'string'),
        queryParam('order_by', 'string'),
      );
    }
    if (doc.links) listParams.push(includeParam(doc.links));
    const listExample = schemaExample
      ? { results: [schemaExample], next_page_token: '' }
      : undefined;
    collectionOps.get = {
      // AEP-130: List operations are named List{Plural}, e.g. ListGiftCards.
      operationId: `List${pascal(doc.plural)}`,
      description: `Returns a paginated list of ${listPlural}.`,
      tags: [name],
      parameters: listParams,
      responses: {
        '200': {
          description: 'Successful response',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  results: {
                    type: 'array',
                    items: { $ref: `#/components/schemas/${doc.singular}` },
                    description: `The list of ${listPlural}.`,
                    ...(schemaExample ? { example: [schemaExample] } : {}),
                  },
                  next_page_token: {
                    type: 'string',
                    description:
                      'A token to retrieve the next page of results. Empty if there are no more results.',
                    example: '',
                  },
                },
              },
              ...(listExample ? { example: listExample } : {}),
            },
          },
        },
        '400': errResp(400, 'The request parameters are invalid.', 'invalid filter expression'),
      },
    };
  }
  if (doc.methods.create) {
    const createParams: Json[] = [...parentParams];
    if (doc.userSettableId) createParams.push(queryParam('id', 'string'));
    collectionOps.post = {
      operationId: `Create${pascal(doc.singular)}`,
      description: `Creates a new ${name}.`,
      tags: [name],
      ...(createParams.length > 0 ? { parameters: createParams } : {}),
      requestBody: {
        description: `The ${name} to create.`,
        required: true,
        content: {
          'application/json': { schema: { $ref: `#/components/schemas/${doc.singular}` } },
        },
      },
      responses: {
        '201': successRef(doc.singular),
        '400': badRequest,
        '409': conflict,
      },
    };
  }
  if (Object.keys(collectionOps).length > 0) paths[collectionPath] = collectionOps;

  const resourceOps: Json = {};
  const resourceParams = [...parentParams, pathParam(idParam)];
  if (doc.methods.get) {
    resourceOps.get = {
      operationId: `Get${pascal(doc.singular)}`,
      description: `Retrieves a single ${name} by ID.`,
      tags: [name],
      parameters: doc.links ? [...resourceParams, includeParam(doc.links)] : resourceParams,
      responses: { '200': successRef(doc.singular, schemaExample), '404': notFound },
    };
  }
  if (doc.methods.update) {
    resourceOps.patch = {
      operationId: `Update${pascal(doc.singular)}`,
      description: `Updates an existing ${name}. Only the fields provided in the request body are modified.`,
      tags: [name],
      parameters: resourceParams,
      requestBody: {
        description: `The fields to update on the ${name}.`,
        required: true,
        content: {
          'application/merge-patch+json': {
            schema: { $ref: `#/components/schemas/${doc.singular}` },
          },
        },
      },
      responses: {
        '200': successRef(doc.singular, schemaExample),
        '400': badRequest,
        '404': notFound,
      },
    };
  }
  if (doc.methods.apply) {
    resourceOps.put = {
      operationId: `Apply${pascal(doc.singular)}`,
      description: `Creates or replaces a ${name}.`,
      tags: [name],
      parameters: resourceParams,
      requestBody: {
        description: `The full ${name} to create or replace.`,
        required: true,
        content: {
          'application/json': { schema: { $ref: `#/components/schemas/${doc.singular}` } },
        },
      },
      responses: {
        '200': successRef(doc.singular, schemaExample),
        '201': successRef(doc.singular),
        '400': badRequest,
      },
    };
  }
  if (doc.methods.delete) {
    const deleteParams = doc.hasChildren
      ? [...resourceParams, queryParam('force', 'boolean')]
      : resourceParams;
    resourceOps.delete = {
      operationId: `Delete${pascal(doc.singular)}`,
      description: `Deletes a ${name} by ID.`,
      tags: [name],
      parameters: deleteParams,
      responses: {
        '204': {
          description: 'Successful response',
          content: { 'application/json': { schema: { type: 'object' }, example: {} } },
        },
        '404': notFound,
      },
    };
  }
  if (Object.keys(resourceOps).length > 0) paths[resourcePath] = resourceOps;

  if (doc.fileFields.size > 0 || doc.nestedFileFields.size > 0) {
    // `file` (a file below the top level, by id) is documented only where such
    // files exist, so resources with top-level file fields alone keep the
    // original `{ field }` contract.
    const downloadBody: Json =
      doc.nestedFileFields.size > 0
        ? {
            type: 'object',
            description: 'Name the file by `field` or by `file`, not both.',
            properties: {
              ...(doc.fileFields.size > 0
                ? { field: { type: 'string', description: 'Name of the top-level file field to download.' } }
                : {}),
              file: { type: 'string', description: 'Id of a file below the top level, from the record.' },
            },
          }
        : {
            type: 'object',
            required: ['field'],
            properties: {
              field: {
                type: 'string',
                description: 'Name of the file field to download.',
              },
            },
          };
    paths[`${resourcePath}:download`] = {
      post: {
        operationId: `:Download${pascal(doc.singular)}`,
        description: '',
        tags: [`:download${pascal(doc.singular).toLowerCase()}`],
        parameters: resourceParams,
        requestBody: {
          description: '',
          required: true,
          content: {
            'application/json': { schema: downloadBody },
          },
        },
        responses: {
          '200': {
            description: 'Successful response',
            content: {
              'application/json': {
                schema: {
                  type: 'string',
                  format: 'binary',
                  description: 'The raw file contents.',
                },
              },
            },
          },
        },
      },
    };
  }

  return paths;
}

/**
 * Hoist a tagged union's inline variants into `components.schemas`, replacing
 * each with a `$ref` to the name its `discriminator.mapping` already points at.
 *
 * OpenAPI requires every `mapping` value resolve to a real schema, so emitting
 * the variants inline while the mapping names components would leave dangling
 * refs. Unions without a mapping stay inline, which is still valid — there's
 * just no name to hoist them under.
 */
function hoistUnionVariants(schema: Json, schemas: Record<string, Json>): void {
  const properties = schema.properties as Record<string, Json> | undefined;
  for (const prop of Object.values(properties ?? {})) {
    const oneOf = prop.oneOf as Json[] | undefined;
    const discriminator = prop.discriminator as
      | { propertyName: string; mapping?: Record<string, string> }
      | undefined;
    if (!oneOf || !discriminator?.mapping) continue;

    const tag = discriminator.propertyName;
    // A new array: `componentSchema` shallow-copies each property, so mutating
    // the original would reach through into the registry's stored schema.
    prop.oneOf = oneOf.map((variant) => {
      const variantProps = variant.properties as Record<string, Json> | undefined;
      const tagValues = variantProps?.[tag]?.enum as string[] | undefined;
      const ref = tagValues?.[0] ? discriminator.mapping![tagValues[0]] : undefined;
      const name = ref?.split('/').pop();
      // Never clobber a resource's own component schema.
      if (!ref || !name || name in schemas) return variant;
      schemas[name] = variant;
      return { $ref: ref };
    });
  }
}

export function buildOpenApi(reg: Registry): Json {
  const docs: ResourceDoc[] = [
    metaResourceDoc(),
    ...reg
      .all()
      .map((r) => registeredToDoc(r, reg.children(r.singular).length > 0, [...linksOf(reg, r).keys()].sort())),
  ];

  const schemas: Record<string, Json> = {};
  const paths: Record<string, Json> = {};
  const tags: Json[] = [];

  for (const doc of docs) {
    const schema = componentSchema(doc);
    schemas[doc.singular] = schema;
    hoistUnionVariants(schema, schemas);
    const schemaExample = (schema.example as Json | undefined) ?? undefined;
    Object.assign(paths, buildPaths(doc, schemaExample));
    const tag: Json = { name: doc.singular };
    if (doc.description) tag.description = doc.description;
    tags.push(tag);
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'aepbase',
      description:
        'A dynamic API backend following the AEP standard. Define resources at runtime and get automatic CRUD endpoints, OpenAPI specs, and more.',
      version: '0.1.0',
      contact: { name: 'aepbase', url: 'https://github.com/rambleraptor/aepbase' },
      license: { name: 'MIT', url: 'https://opensource.org/licenses/MIT' },
    },
    servers: [{ url: reg.serverUrl }],
    paths,
    components: { schemas },
    tags,
  };
}
