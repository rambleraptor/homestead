/**
 * aepbase Helper Functions for E2E Tests
 *
 * Direct REST helpers for seeding and cleaning up test data. Takes a bearer
 * token + optional parent path. Designed to replace the old
 * `pocketbase-helpers.ts` with the same signatures, adjusted to aepbase's
 * kebab-case collections and nested child URLs.
 */

import { getAepbaseUrl } from '../config/aepbase.setup';

type ParentPath = string[];

interface RequestOptions {
  token: string;
  method?: string;
  body?: unknown;
  mergePatch?: boolean;
  multipart?: FormData;
}

async function req(path: string, opts: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${opts.token}`,
  };
  let body: BodyInit | undefined;
  if (opts.multipart) {
    body = opts.multipart;
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = opts.mergePatch
      ? 'application/merge-patch+json'
      : 'application/json';
    body = JSON.stringify(opts.body);
  }
  return fetch(`${getAepbaseUrl()}${path}`, {
    method: opts.method || 'GET',
    headers,
    body,
  });
}

function pathFor(plural: string, parent?: ParentPath): string {
  if (parent && parent.length > 0) return '/' + parent.join('/') + `/${plural}`;
  return `/${plural}`;
}

export async function aepGet<T>(
  token: string,
  plural: string,
  id: string,
  parent?: ParentPath,
): Promise<T> {
  const res = await req(`${pathFor(plural, parent)}/${id}`, { token });
  if (!res.ok) throw new Error(`get ${plural}/${id} failed: ${res.status}`);
  return (await res.json()) as T;
}

export async function aepUpdate<T>(
  token: string,
  plural: string,
  id: string,
  body: Record<string, unknown>,
  parent?: ParentPath,
): Promise<T> {
  const res = await req(`${pathFor(plural, parent)}/${id}`, {
    token,
    method: 'PATCH',
    body,
    mergePatch: true,
  });
  if (!res.ok) throw new Error(`update ${plural}/${id} failed: ${res.status}`);
  return (await res.json()) as T;
}

export async function aepList<T>(
  token: string,
  plural: string,
  parent?: ParentPath,
): Promise<T[]> {
  const res = await req(`${pathFor(plural, parent)}?max_page_size=200`, { token });
  if (!res.ok) {
    if (res.status === 404 || res.status === 403) return [];
    throw new Error(`list ${plural} failed: ${res.status}`);
  }
  const body = (await res.json()) as { results?: T[] };
  return body.results || [];
}

export async function aepCreate<T>(
  token: string,
  plural: string,
  body: Record<string, unknown>,
  parent?: ParentPath,
): Promise<T> {
  const res = await req(pathFor(plural, parent), { token, method: 'POST', body });
  if (!res.ok) {
    throw new Error(`create ${plural} failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as T;
}

export async function aepCreateMultipart<T>(
  token: string,
  plural: string,
  formData: FormData,
  parent?: ParentPath,
): Promise<T> {
  const res = await req(pathFor(plural, parent), {
    token,
    method: 'POST',
    multipart: formData,
  });
  if (!res.ok) {
    throw new Error(`create ${plural} failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as T;
}

export async function aepRemove(
  token: string,
  plural: string,
  id: string,
  parent?: ParentPath,
): Promise<void> {
  const res = await req(`${pathFor(plural, parent)}/${id}`, {
    token,
    method: 'DELETE',
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`delete ${plural}/${id} failed: ${res.status}`);
  }
}

// ---------------------------------------------------------------------------
// Domain-specific helpers (same shapes the old PB helpers exported)
// ---------------------------------------------------------------------------

interface CreateGiftCardInput {
  merchant: string;
  amount: number;
  card_number?: string;
  pin?: string;
  notes?: string;
}

export interface GiftCardRecord {
  id: string;
  merchant: string;
  amount: number;
  card_number: string;
  pin?: string;
  notes?: string;
}

export async function createGiftCard(
  token: string,
  data: CreateGiftCardInput,
): Promise<GiftCardRecord> {
  return aepCreate<GiftCardRecord>(token, 'gift-cards', {
    merchant: data.merchant,
    amount: data.amount,
    card_number:
      data.card_number ||
      `TEST-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    pin: data.pin || '',
    notes: data.notes || '',
  });
}

export async function createMultipleGiftCards(
  token: string,
  cards: Array<CreateGiftCardInput>,
) {
  const results = [];
  for (const card of cards) {
    results.push(await createGiftCard(token, card));
  }
  return results;
}

interface CreatePersonInput {
  name: string;
  address?: string;
  birthday?: string;
  anniversary?: string;
  /**
   * Required when `address` is set — the address resource has
   * `created_by` in its `required` list per the canonical schema.
   * Pass the test user's id from the `userId` fixture.
   */
  createdByUserId?: string;
}

export interface PersonRecord {
  id: string;
  name: string;
  birthday?: string;
}

export async function createPerson(
  token: string,
  data: CreatePersonInput,
): Promise<PersonRecord> {
  const person = await aepCreate<PersonRecord>(token, 'people', {
    name: data.name,
    birthday: data.birthday,
  });

  if (data.address || data.anniversary) {
    let addressId: string | null = null;
    if (data.address) {
      if (!data.createdByUserId) {
        throw new Error(
          'createPerson: createdByUserId is required when `address` is set',
        );
      }
      const address = await aepCreate<{ id: string }>(token, 'addresses', {
        line1: data.address,
        created_by: `users/${data.createdByUserId}`,
      });
      addressId = address.id;
    }
    await aepCreate(token, 'person-shared-data', {
      person_a: person.id,
      person_b: undefined,
      address_id: addressId ?? undefined,
      anniversary: data.anniversary,
    });
  }

  return person;
}

export async function createMultiplePeople(
  token: string,
  people: Array<CreatePersonInput>,
) {
  const results = [];
  for (const person of people) {
    results.push(await createPerson(token, person));
  }
  return results;
}

export async function deleteAllGiftCards(token: string) {
  const items = await aepList<{ id: string }>(token, 'gift-cards');
  for (const item of items) {
    await aepRemove(token, 'gift-cards', item.id);
  }
}

export async function getPersonSharedData(token: string, personId: string) {
  const all = await aepList<{
    id: string;
    person_a: string;
    person_b?: string;
    address_id?: string;
    anniversary?: string;
  }>(token, 'person-shared-data');
  return all.find((s) => s.person_a === personId || s.person_b === personId) || null;
}

export async function deleteAllPeople(token: string) {
  const items = await aepList<{ id: string }>(token, 'people');
  for (const item of items) {
    await aepRemove(token, 'people', item.id);
  }
}

export async function deleteAllAddresses(token: string) {
  const items = await aepList<{ id: string }>(token, 'addresses');
  for (const item of items) {
    await aepRemove(token, 'addresses', item.id);
  }
}

export async function deleteAllPersonSharedData(token: string) {
  const items = await aepList<{ id: string }>(token, 'person-shared-data');
  for (const item of items) {
    await aepRemove(token, 'person-shared-data', item.id);
  }
}

interface CreateHSAReceiptInput {
  merchant: string;
  service_date: string;
  amount: number;
  category: 'Medical' | 'Dental' | 'Vision' | 'Rx';
  patient?: string;
  status: 'Stored' | 'Reimbursed';
  notes?: string;
}

export interface HSAReceiptRecord {
  id: string;
  merchant: string;
  service_date: string;
  amount: number;
  category: 'Medical' | 'Dental' | 'Vision' | 'Rx';
  status: 'Stored' | 'Reimbursed';
  patient?: string;
  notes?: string;
}

export async function createHSAReceipt(
  token: string,
  data: CreateHSAReceiptInput,
): Promise<HSAReceiptRecord> {
  // Minimal valid JPEG (required file field).
  const jpegBytes = new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
  ]);
  const blob = new Blob([jpegBytes], { type: 'image/jpeg' });
  const resource: Record<string, unknown> = {
    merchant: data.merchant,
    service_date: data.service_date,
    amount: data.amount,
    category: data.category,
    status: data.status,
  };
  if (data.patient) resource.patient = data.patient;
  if (data.notes) resource.notes = data.notes;

  const formData = new FormData();
  formData.append('resource', JSON.stringify(resource));
  formData.append('receipt_file', blob, 'test-receipt.jpg');

  return aepCreateMultipart<HSAReceiptRecord>(token, 'hsa-receipts', formData);
}

export async function createMultipleHSAReceipts(
  token: string,
  receipts: Array<CreateHSAReceiptInput>,
) {
  const results = [];
  for (const receipt of receipts) {
    results.push(await createHSAReceipt(token, receipt));
  }
  return results;
}

export async function deleteAllHSAReceipts(token: string) {
  const items = await aepList<{ id: string }>(token, 'hsa-receipts');
  for (const item of items) {
    await aepRemove(token, 'hsa-receipts', item.id);
  }
}

// ---------------------------------------------------------------------------
// Minigolf (games + holes)
// ---------------------------------------------------------------------------

interface CreateGameInput {
  /** Player resource paths: `["people/{id}", ...]`. */
  players: string[];
  hole_count: number;
  location?: string;
  played_at?: string;
  completed?: boolean;
}

export interface GameRecord {
  id: string;
  players: string[];
  hole_count: number;
  location?: string;
  played_at?: string;
  completed?: boolean;
}

export async function createGame(
  token: string,
  data: CreateGameInput,
): Promise<GameRecord> {
  return aepCreate<GameRecord>(token, 'games', {
    players: data.players,
    hole_count: data.hole_count,
    location: data.location,
    played_at: data.played_at || new Date().toISOString(),
    completed: data.completed ?? false,
  });
}

export async function deleteAllGames(token: string) {
  const items = await aepList<{ id: string }>(token, 'games');
  for (const item of items) {
    await aepRemove(token, 'games', item.id);
  }
}

// ---------------------------------------------------------------------------
// Pictionary
// ---------------------------------------------------------------------------

export interface CreatePictionaryTeamInput {
  players: string[];
  won?: boolean;
  rank?: number;
}

export interface CreatePictionaryGameInput {
  played_at?: string;
  location?: string;
  winning_word?: string;
  notes?: string;
  teams: CreatePictionaryTeamInput[];
}

export interface PictionaryGameRecord {
  id: string;
  played_at: string;
  location?: string;
  winning_word?: string;
  notes?: string;
}

export interface PictionaryTeamRecord {
  id: string;
  players: string[];
  won?: boolean;
  rank?: number;
}

export async function createPictionaryGame(
  token: string,
  data: CreatePictionaryGameInput,
): Promise<{
  game: PictionaryGameRecord;
  teams: PictionaryTeamRecord[];
}> {
  const game = await aepCreate<PictionaryGameRecord>(
    token,
    'pictionary-games',
    {
      played_at: data.played_at || new Date().toISOString(),
      location: data.location,
      winning_word: data.winning_word,
      notes: data.notes,
    },
  );
  const teams: PictionaryTeamRecord[] = [];
  for (let i = 0; i < data.teams.length; i++) {
    const team = data.teams[i];
    const created = await aepCreate<PictionaryTeamRecord>(
      token,
      'pictionary-teams',
      {
        players: team.players,
        won: team.won ?? false,
        rank: team.rank ?? i + 1,
      },
      ['pictionary-games', game.id],
    );
    teams.push(created);
  }
  return { game, teams };
}

export async function deleteAllPictionaryGames(token: string) {
  const items = await aepList<{ id: string }>(token, 'pictionary-games');
  for (const item of items) {
    await aepRemove(token, 'pictionary-games', item.id);
  }
}

// ---------------------------------------------------------------------------
// Recipes
// ---------------------------------------------------------------------------

export interface RecipeIngredientInput {
  item: string;
  qty: number;
  unit: string;
  raw?: string;
}

export interface CreateRecipeInput {
  title: string;
  parsed_ingredients: RecipeIngredientInput[];
  source_pointer?: string;
  method?: string;
  tags?: string[];
}

export interface RecipeRecord {
  id: string;
  title: string;
  source_pointer?: string;
  parsed_ingredients: RecipeIngredientInput[];
  method?: string;
  tags?: string[];
}

export async function createRecipe(
  token: string,
  data: CreateRecipeInput,
): Promise<RecipeRecord> {
  return aepCreate<RecipeRecord>(token, 'recipes', {
    title: data.title,
    source_pointer: data.source_pointer,
    parsed_ingredients: data.parsed_ingredients.map((ing) => ({
      ...ing,
      raw: ing.raw ?? `${ing.qty} ${ing.unit} ${ing.item}`.trim(),
    })),
    method: data.method,
    tags: data.tags,
  });
}

export async function deleteAllRecipes(token: string) {
  const items = await aepList<{ id: string }>(token, 'recipes');
  for (const item of items) {
    await aepRemove(token, 'recipes', item.id);
  }
}

// ---------------------------------------------------------------------------
// Todos
// ---------------------------------------------------------------------------

export type TodoStatus =
  | 'pending'
  | 'in_progress'
  | 'do_later'
  | 'completed'
  | 'cancelled';

export interface TodoRecord {
  id: string;
  title: string;
  status: TodoStatus;
  project?: string;
  in_main?: boolean;
}

export async function createTodo(
  token: string,
  data: {
    title: string;
    status?: TodoStatus;
    project_id?: string;
    in_main?: boolean;
  },
): Promise<TodoRecord> {
  return aepCreate<TodoRecord>(token, 'todos', {
    title: data.title,
    status: data.status ?? 'pending',
    ...(data.project_id ? { project: `projects/${data.project_id}` } : {}),
    ...(data.in_main !== undefined ? { in_main: data.in_main } : {}),
  });
}

export async function deleteAllTodos(token: string) {
  const items = await aepList<{ id: string }>(token, 'todos');
  for (const item of items) {
    await aepRemove(token, 'todos', item.id);
  }
}

// ---------------------------------------------------------------------------
// Projects (parent of todos via field reference, not URL parent)
// ---------------------------------------------------------------------------

export interface ProjectRecord {
  id: string;
  name: string;
}

export async function createProject(
  token: string,
  data: { name: string },
): Promise<ProjectRecord> {
  return aepCreate<ProjectRecord>(token, 'projects', { name: data.name });
}

export async function deleteAllProjects(token: string) {
  const items = await aepList<{ id: string }>(token, 'projects');
  for (const item of items) {
    await aepRemove(token, 'projects', item.id);
  }
}

// ---------------------------------------------------------------------------
// Module flags (household-wide singleton)
// ---------------------------------------------------------------------------

interface ModuleFlagsRecord {
  id: string;
  [field: string]: unknown;
}

/** Upsert a single module flag. Mirrors `useUpdateModuleFlag.upsertFlag`. */
export async function setModuleFlag(
  token: string,
  moduleId: string,
  key: string,
  value: string | number | boolean,
): Promise<void> {
  const flatField = `${moduleId.replace(/-/g, '_')}__${key}`;
  const payload = { [flatField]: value };
  const existing = await aepList<ModuleFlagsRecord>(token, 'module-flags');
  if (existing.length > 0) {
    await aepUpdate<ModuleFlagsRecord>(
      token,
      'module-flags',
      existing[0].id,
      payload,
    );
    return;
  }
  await aepCreate<ModuleFlagsRecord>(token, 'module-flags', payload);
}

/** Delete every module-flags singleton record (resets all flags to defaults). */
export async function resetModuleFlags(token: string) {
  const records = await aepList<ModuleFlagsRecord>(token, 'module-flags');
  for (const record of records) {
    await aepRemove(token, 'module-flags', record.id);
  }
}

/** Wipe everything the test user can see. */
export async function cleanupUserData(token: string, _userId: string) {
  await Promise.all([
    deleteAllGiftCards(token),
    deleteAllPersonSharedData(token),
    deleteAllPeople(token),
    deleteAllAddresses(token),
    deleteAllHSAReceipts(token),
    deleteAllGames(token),
    deleteAllPictionaryGames(token),
    deleteAllTodos(token),
    deleteAllProjects(token),
  ]);
}

// ---------------------------------------------------------------------------
// Users (superuser-only)
// ---------------------------------------------------------------------------

interface CreateUserInput {
  email: string;
  password: string;
  display_name?: string;
  type?: 'regular' | 'superuser';
}

export interface UserRecord {
  id: string;
  email: string;
  display_name?: string;
  type?: 'regular' | 'superuser';
}

export async function createUser(
  adminToken: string,
  data: CreateUserInput,
): Promise<UserRecord> {
  return aepCreate<UserRecord>(adminToken, 'users', {
    email: data.email,
    password: data.password,
    display_name: data.display_name || '',
    type: data.type || 'regular',
  });
}

/**
 * Delete every user except the ids in `preserveIds`. Used by Users module
 * tests to tidy up without wiping the bootstrap superuser or the fixture-
 * owned `testUser`.
 */
export async function deleteUsersExcept(
  adminToken: string,
  preserveIds: string[],
) {
  const users = await aepList<{ id: string }>(adminToken, 'users');
  const keep = new Set(preserveIds);
  for (const u of users) {
    if (keep.has(u.id)) continue;
    await aepRemove(adminToken, 'users', u.id);
  }
}
