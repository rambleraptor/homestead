/**
 * The dashboard route is the home, with the conversation from its address.
 * The home itself is covered by `agentic/__tests__/AgenticHome.test.tsx` and
 * the VM specs.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DashboardHome } from '../DashboardHome';

vi.mock('../agentic/AgenticHome', () => ({
  AgenticHome: ({ conversationId }: { conversationId: string | null }) => (
    <div data-testid="home-stub" data-conversation={conversationId ?? ''} />
  ),
}));

describe('DashboardHome', () => {
  it('is the home, on a new conversation at /dashboard', () => {
    render(<DashboardHome />);
    expect(screen.getByTestId('home-stub')).toHaveAttribute('data-conversation', '');
  });

  it('opens the conversation in the address', () => {
    render(<DashboardHome params={{ id: 'conv-1' }} />);
    expect(screen.getByTestId('home-stub')).toHaveAttribute('data-conversation', 'conv-1');
  });
});
