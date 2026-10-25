/**
 * Tests for the inbox's click-through.
 *
 * `url` has been carried on the push payload for a while and is now stored on
 * the inbox row too — but a stored field nothing renders is the same as no
 * field, which is what these guard.
 */

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { NotificationsHome } from '../components/NotificationsHome';
import type { Notification } from '../types';

const mockUseNotifications = vi.fn();
vi.mock('../hooks/useNotifications', () => ({
  useNotifications: () => mockUseNotifications(),
}));
vi.mock('../hooks/useScheduledNotifications', () => ({
  useScheduledNotifications: () => ({ data: [] }),
}));
vi.mock('../hooks/useMarkNotificationAsRead', () => ({
  useMarkNotificationAsRead: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@rambleraptor/homestead-core/household/useHousehold', () => ({
  useHousehold: () => ({ data: [{ id: 'u2', name: 'Sam', admin: false }] }),
}));

function notification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'n1',
    user_id: 'u1',
    title: 'Bins out tonight',
    message: 'Trash and Recycling.',
    notification_type: 'reminder',
    read: false,
    created: new Date('2026-06-15T18:00:00Z').toISOString(),
    updated: new Date('2026-06-15T18:00:00Z').toISOString(),
    ...overrides,
  };
}

function renderWith(data: Notification[]) {
  mockUseNotifications.mockReturnValue({ data, isLoading: false });
  return render(
    <MemoryRouter>
      <NotificationsHome />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockUseNotifications.mockReset();
});

describe('inbox click-through', () => {
  test('a notification with a url links to it', () => {
    renderWith([notification({ url: '/home' })]);
    expect(screen.getByTestId('notification-link-n1')).toHaveAttribute('href', '/home');
  });

  test('a notification without a url is plain text', () => {
    renderWith([notification()]);
    expect(screen.queryByTestId('notification-link-n1')).not.toBeInTheDocument();
    // Still readable — the title just isn't a link.
    expect(screen.getByText('Bins out tonight')).toBeInTheDocument();
  });

  test('an off-site url is not turned into a link', () => {
    // Inbox rows are written by server code, but a url is free-form text on the
    // record — rendering whatever it says as an anchor would be careless.
    renderWith([notification({ url: 'https://example.com/phish' })]);
    expect(screen.queryByTestId('notification-link-n1')).not.toBeInTheDocument();
  });

  test('a protocol-relative url is not treated as internal', () => {
    renderWith([notification({ url: '//evil.example.com' })]);
    expect(screen.queryByTestId('notification-link-n1')).not.toBeInTheDocument();
  });
});

describe('messages', () => {
  test('say who sent them', () => {
    renderWith([
      notification({ id: 'm1', notification_type: 'message', from_user: 'users/u2' }),
      notification({ id: 'm2', notification_type: 'message', from_user: 'users/gone' }),
      notification({ id: 'r1' }),
    ]);
    expect(screen.getByTestId('notification-from-m1')).toHaveTextContent('From Sam');
    expect(screen.getByTestId('notification-from-m2')).toHaveTextContent('From a household member');
    expect(screen.queryByTestId('notification-from-r1')).toBeNull();
  });
});
