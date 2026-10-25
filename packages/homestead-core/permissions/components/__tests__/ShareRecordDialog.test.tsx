/**
 * ShareRecordDialog writes ordinary record-scope access-grants through the
 * generic hooks, lists who a record is shared with, and gates its add/revoke
 * controls on the caller being able to `manage` the record. The aepbase client
 * is globally mocked (see setup.ts); `useCan` is mocked so no auth context is
 * needed.
 */

import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { aepbase, AepbaseError } from '@rambleraptor/homestead-core/api/aepbase';
import { ACCESS_GRANTS } from '../../resources';
import type { AccessGrantRecord } from '../../hooks';
import { ShareRecordDialog } from '../ShareRecordDialog';

const { mockCan } = vi.hoisted(() => ({ mockCan: vi.fn(() => true) }));
vi.mock('../../useCan', () => ({ useCan: () => mockCan }));

const USERS = [
  { id: 'alice', display_name: 'Alice', email: 'alice@example.com' },
  { id: 'bob', display_name: 'Bob', email: 'bob@example.com' },
];
const GROUPS = [{ id: 'g1', name: 'Adults' }];

function mockGrants(grants: AccessGrantRecord[]) {
  vi.mocked(aepbase.list).mockImplementation((async (collection: string) => {
    if (collection === 'users') return USERS;
    if (collection === 'groups') return GROUPS;
    if (collection === ACCESS_GRANTS) return grants;
    return [];
  }) as never);
}

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

function renderDialog(props: Partial<React.ComponentProps<typeof ShareRecordDialog>> = {}) {
  return render(
    <ShareRecordDialog
      isOpen
      onClose={() => {}}
      resourceType="recipe"
      recordId="r1"
      recordName="Chili"
      ownerId="alice"
      {...props}
    />,
    { wrapper: createWrapper() },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCan.mockReturnValue(true);
  mockGrants([]);
  vi.mocked(aepbase.create).mockResolvedValue({ id: 'new-grant' } as never);
  vi.mocked(aepbase.remove).mockResolvedValue(undefined as never);
});

describe('ShareRecordDialog', () => {
  it('shows an empty state and excludes the owner from the picker', async () => {
    renderDialog();
    expect(await screen.findByTestId('share-record-empty')).toBeInTheDocument();
    const select = screen.getByTestId('share-record-subject') as HTMLSelectElement;
    const values = Array.from(select.querySelectorAll('option')).map((o) => o.value);
    expect(values).toContain('user:bob');
    expect(values).not.toContain('user:alice'); // owner excluded
    expect(values).toContain('group:g1');
  });

  it("offers a member the household when they can't list every account", async () => {
    vi.mocked(aepbase.list).mockImplementation((async (collection: string) => {
      if (collection === 'users') throw new AepbaseError(403, 'only superusers can list users', '/users');
      if (collection === 'groups') return GROUPS;
      return [];
    }) as never);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({ members: [{ id: 'sam', name: 'Sam', admin: false }] }),
    );
    try {
      renderDialog();
      const select = (await screen.findByTestId('share-record-subject')) as HTMLSelectElement;
      await waitFor(() =>
        expect(Array.from(select.querySelectorAll('option')).map((o) => o.textContent)).toContain('Sam'),
      );
      expect(fetchSpy).toHaveBeenCalledWith('/api/household', expect.anything());
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('shares a record with a user at the chosen capability', async () => {
    renderDialog();
    await screen.findByTestId('share-record-empty');
    fireEvent.change(screen.getByTestId('share-record-subject'), {
      target: { value: 'user:bob' },
    });
    fireEvent.change(screen.getByTestId('share-record-access'), { target: { value: 'read' } });
    fireEvent.click(screen.getByTestId('share-record-add'));

    await waitFor(() =>
      expect(aepbase.create).toHaveBeenCalledWith(ACCESS_GRANTS, {
        subject_type: 'user',
        subject_id: 'bob',
        target_scope: 'record',
        resource_type: 'recipe',
        resource_id: 'r1',
        capability: 'read',
      }),
    );
  });

  it('shares a record with a group', async () => {
    renderDialog();
    await screen.findByTestId('share-record-empty');
    fireEvent.change(screen.getByTestId('share-record-subject'), {
      target: { value: 'group:g1' },
    });
    fireEvent.click(screen.getByTestId('share-record-add'));

    await waitFor(() =>
      expect(aepbase.create).toHaveBeenCalledWith(
        ACCESS_GRANTS,
        expect.objectContaining({ subject_type: 'group', subject_id: 'g1', target_scope: 'record' }),
      ),
    );
  });

  it('writes a deny grant (effect + manage) when blocking', async () => {
    renderDialog();
    await screen.findByTestId('share-record-empty');
    fireEvent.change(screen.getByTestId('share-record-subject'), {
      target: { value: 'user:bob' },
    });
    fireEvent.change(screen.getByTestId('share-record-access'), { target: { value: 'blocked' } });
    fireEvent.click(screen.getByTestId('share-record-add'));

    await waitFor(() =>
      expect(aepbase.create).toHaveBeenCalledWith(ACCESS_GRANTS, {
        subject_type: 'user',
        subject_id: 'bob',
        target_scope: 'record',
        resource_type: 'recipe',
        resource_id: 'r1',
        capability: 'manage',
        effect: 'deny',
      }),
    );
  });

  it('invokes the onShare extension seam after the primary grant', async () => {
    const onShare = vi.fn().mockResolvedValue(undefined);
    renderDialog({ onShare });
    await screen.findByTestId('share-record-empty');
    fireEvent.change(screen.getByTestId('share-record-subject'), {
      target: { value: 'user:bob' },
    });
    fireEvent.click(screen.getByTestId('share-record-add'));

    await waitFor(() =>
      expect(onShare).toHaveBeenCalledWith(
        { type: 'user', id: 'bob' },
        { capability: 'write', effect: 'allow' },
      ),
    );
  });

  it('lists current shares and revokes one (running the onRevoke seam first)', async () => {
    const grant: AccessGrantRecord = {
      id: 'grant-1',
      subject_type: 'user',
      subject_id: 'bob',
      target_scope: 'record',
      resource_type: 'recipe',
      resource_id: 'r1',
      capability: 'write',
    };
    mockGrants([grant]);
    const onRevoke = vi.fn().mockResolvedValue(undefined);
    renderDialog({ onRevoke });

    const list = await screen.findByTestId('share-record-list');
    expect(within(list).getByText('Bob')).toBeInTheDocument();
    expect(within(list).getByText('Can edit')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('share-record-revoke-allow-bob'));
    await waitFor(() => expect(onRevoke).toHaveBeenCalledWith(grant));
    expect(aepbase.remove).toHaveBeenCalledWith(ACCESS_GRANTS, 'grant-1');
  });

  it('hides the add form for a caller who cannot manage the record', async () => {
    mockCan.mockReturnValue(false);
    renderDialog();
    await screen.findByTestId('share-record-empty');
    expect(screen.queryByTestId('share-record-subject')).not.toBeInTheDocument();
    expect(screen.queryByTestId('share-record-add')).not.toBeInTheDocument();
  });
});
