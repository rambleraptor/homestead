import { describe, expect, test } from 'vitest';
import { toWireSchema } from '@rambleraptor/homestead-core/resources/translate';
import { groceriesResources } from '@rambleraptor/homestead-apps/groceries/resources';
import { todosResources } from '@rambleraptor/homestead-apps/todos/resources';
import { nativeScopes } from '@rambleraptor/homestead-core/mobile/bridge';
import { insertToken } from '../../src/engine/users';
import { call, defineResource, makeEngine, seedOpenHousehold, seedUser } from './helpers';

describe('iOS native adapter contract', () => {
  test('scoped credentials create, filter, paginate, and complete existing grocery/todo resources', async () => {
    const t = await makeEngine();
    await seedOpenHousehold(t);
    for (const def of [...groceriesResources, ...todosResources]) {
      const response = await defineResource(t, {
        singular: def.singular, plural: def.plural, parents: def.parents ?? [],
        user_settable_create: def.user_settable_create,
        schema: toWireSchema(def.fields, def.singular),
      }, def.singular);
      expect(response.status).toBe(200);
    }
    const owner = await seedUser(t.engine, { email: 'mobile@example.com' });
    const token = 'test-mobile-scoped-token';
    insertToken(t.engine.db, token, owner.user.id, null, 'mobile-device');
    for (const scope of nativeScopes(['groceries', 'todos'])) {
      const res = await call(t.engine, 'POST', '/access-grants', { token: t.adminToken, body: {
        subject_type: 'token', subject_id: 'mobile-device', effect: 'allow', ...scope,
      } });
      expect(res.status).toBe(201);
    }
    t.engine.reloadPermissions();
    const me = await call(t.engine, 'GET', '/users/me', { token });
    expect(me.status).toBe(200); expect((await me.json()).id).toBe(owner.user.id);
    // Selectable stores/projects are read-only for the device token.
    expect((await call(t.engine, 'POST', '/stores', { token, body: { name: 'Not permitted' } })).status).toBe(403);
    const store = await (await call(t.engine, 'POST', '/stores', { token: owner.token, body: { name: 'Market' } })).json();
    const grocery = await call(t.engine, 'POST', '/groceries', { token, body: { name: 'Milk', store: store.id } });
    expect(grocery.status).toBe(201);
    const saved = await grocery.json(); expect(saved.checked).toBe(false);
    await call(t.engine, 'POST', '/groceries', { token, body: { name: 'Eggs', store: store.id } });
    const query = new URLSearchParams({ filter: `checked == false && store == "${store.id}"`, max_page_size: '1' });
    const list = await call(t.engine, 'GET', `/groceries?${query}`, { token });
    expect(list.status).toBe(200);
    const page = await list.json(); expect(page.results).toHaveLength(1); expect(page.next_page_token).toBeTruthy();
    query.set('page_token', page.next_page_token);
    expect((await (await call(t.engine, 'GET', `/groceries?${query}`, { token })).json()).results).toHaveLength(1);
    const checked = await call(t.engine, 'PATCH', `/groceries/${saved.id}`, { token, body: { checked: true }, contentType: 'application/merge-patch+json' });
    expect(checked.status).toBe(200); expect((await checked.json()).checked).toBe(true);
    for (const collection of ['todos', `users/${owner.user.id}/personal-todos`]) {
      const created = await call(t.engine, 'POST', `/${collection}`, { token, body: { title: 'Water the garden', status: 'pending' } });
      expect(created.status).toBe(201);
      const todo = await created.json();
      const pending = await call(t.engine, 'GET', `/${collection}?${new URLSearchParams({ filter: 'status == "pending"' })}`, { token });
      expect(pending.status).toBe(200); expect((await pending.json()).results).toHaveLength(1);
      const done = await call(t.engine, 'PATCH', `/${collection}/${todo.id}`, { token, body: { status: 'completed' }, contentType: 'application/merge-patch+json' });
      expect(done.status).toBe(200); expect((await done.json()).status).toBe('completed');
    }
    t.engine.db.close();
  });
});
