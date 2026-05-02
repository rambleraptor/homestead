/**
 * Tests for `<NestedModuleLanding>`: the generic landing page that a
 * parent module renders to link out to its `children`. Each card is
 * filtered by the child's own built-in `enabled` flag so disabled
 * children are hidden from the landing too.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Gamepad2, Pencil, Flag, Club } from 'lucide-react';
import { NestedModuleLanding } from '../NestedModuleLanding';
import { useModuleEnabledPredicate } from '@rambleraptor/homestead-core/settings/hooks/useIsModuleEnabled';
import type { HomeModule } from '@/modules/types';

vi.mock('@rambleraptor/homestead-core/settings/hooks/useIsModuleEnabled', () => ({
  useModuleEnabledPredicate: vi.fn(),
}));

const minigolf: HomeModule = {
  id: 'minigolf',
  name: 'Mini Golf',
  description: 'Play and track mini golf games',
  icon: Flag,
  basePath: '/games/minigolf',
  routes: [{ path: '', index: true, component: () => null }],
};

const pictionary: HomeModule = {
  id: 'pictionary',
  name: 'Pictionary',
  description: 'Track Pictionary games, teams, and winning words',
  icon: Pencil,
  basePath: '/games/pictionary',
  routes: [{ path: '', index: true, component: () => null }],
};

const bridge: HomeModule = {
  id: 'bridge',
  name: 'Bridge',
  description: 'Record bids for each hand of Bridge',
  icon: Club,
  basePath: '/games/bridge',
  routes: [{ path: '', index: true, component: () => null }],
};

const games: HomeModule = {
  id: 'games',
  name: 'Games',
  description: 'Track games you play with the people in your life',
  icon: Gamepad2,
  basePath: '/games',
  routes: [{ path: '', index: true, component: () => null }],
  children: [minigolf, pictionary, bridge],
};

describe('NestedModuleLanding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders one card per child when all are enabled', () => {
    vi.mocked(useModuleEnabledPredicate).mockReturnValue(() => true);

    render(<NestedModuleLanding module={games} />);

    expect(screen.getByTestId('games-link-minigolf')).toBeInTheDocument();
    expect(screen.getByTestId('games-link-pictionary')).toBeInTheDocument();
    expect(screen.getByTestId('games-link-bridge')).toBeInTheDocument();
  });

  it('filters out children whose enabled flag rejects the viewer', () => {
    vi.mocked(useModuleEnabledPredicate).mockReturnValue(
      (id) => id !== 'bridge',
    );

    render(<NestedModuleLanding module={games} />);

    expect(screen.getByTestId('games-link-minigolf')).toBeInTheDocument();
    expect(screen.getByTestId('games-link-pictionary')).toBeInTheDocument();
    expect(screen.queryByTestId('games-link-bridge')).not.toBeInTheDocument();
  });
});
