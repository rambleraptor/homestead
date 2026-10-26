/**
 * The dashboard route picks the person's home, and a conversation in the
 * address opens on either. The homes themselves are covered by their own
 * tests and the VM specs.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DashboardHome } from '../DashboardHome';
import { useHomeMode } from '../../home';

vi.mock('../../home', () => ({ useHomeMode: vi.fn() }));
vi.mock('../agentic/AgenticHome', () => ({
  AgenticHome: ({ conversationId }: { conversationId: string | null }) => (
    <div data-testid="home-stub" data-conversation={conversationId ?? ''} />
  ),
}));
vi.mock('../ClassicHome', () => ({
  ClassicHome: () => <div data-testid="classic-stub" />,
}));

describe('DashboardHome', () => {
  beforeEach(() => {
    vi.mocked(useHomeMode).mockReturnValue('agentic');
  });

  it("is the assistant's home, on a new conversation at /dashboard", () => {
    render(<DashboardHome />);
    expect(screen.getByTestId('home-stub')).toHaveAttribute('data-conversation', '');
  });

  it('opens the conversation in the address', () => {
    render(<DashboardHome params={{ id: 'conv-1' }} />);
    expect(screen.getByTestId('home-stub')).toHaveAttribute('data-conversation', 'conv-1');
  });

  it("is the classic dashboard for the flag's audience", () => {
    vi.mocked(useHomeMode).mockReturnValue('classic');
    render(<DashboardHome />);
    expect(screen.getByTestId('classic-stub')).toBeInTheDocument();
    expect(screen.queryByTestId('home-stub')).toBeNull();
  });

  it('opens a conversation for the classic audience too', () => {
    vi.mocked(useHomeMode).mockReturnValue('classic');
    render(<DashboardHome params={{ id: 'conv-1' }} />);
    expect(screen.getByTestId('home-stub')).toHaveAttribute('data-conversation', 'conv-1');
  });

  it('shows neither home while the flag loads', () => {
    vi.mocked(useHomeMode).mockReturnValue(undefined);
    const { container } = render(<DashboardHome />);
    expect(container).toBeEmptyDOMElement();
  });
});
