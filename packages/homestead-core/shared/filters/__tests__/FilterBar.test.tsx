import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModuleFiltersProvider, useFilteredItems } from '../FiltersContext';
import { FilterBar } from '../FilterBar';
import type { ModuleFilterDecl } from '../types';

interface Recipe {
  id: string;
  title: string;
  tags?: string[];
}

const RECIPES: Recipe[] = [
  { id: '1', title: 'Pancakes', tags: ['breakfast'] },
  { id: '2', title: 'Vegan Pancakes', tags: ['breakfast', 'vegan'] },
  { id: '3', title: 'Tofu Stir Fry', tags: ['dinner', 'vegan'] },
];

function ListOutput() {
  const items = useFilteredItems<Recipe>();
  return (
    <ul data-testid="list">
      {items.map((r) => (
        <li key={r.id} data-testid={`item-${r.id}`}>
          {r.title}
        </li>
      ))}
    </ul>
  );
}

function renderBar(
  decls: ModuleFilterDecl[],
  initialValues?: Record<string, unknown>,
) {
  return render(
    <ModuleFiltersProvider
      moduleId="recipes"
      decls={decls}
      items={RECIPES}
      initialValues={initialValues}
    >
      <FilterBar />
      <ListOutput />
    </ModuleFiltersProvider>,
  );
}

describe('FilterBar', () => {
  it('renders nothing when there are no decls', () => {
    renderBar([]);
    expect(screen.queryByTestId('filter-bar')).not.toBeInTheDocument();
  });

  it('text filter narrows the list as you type', () => {
    renderBar([{ key: 'title', label: 'Title', type: 'text' }]);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    fireEvent.change(screen.getByTestId('filter-text-title'), {
      target: { value: 'vegan' },
    });
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByTestId('item-2')).toBeInTheDocument();
  });

  it('enum multi chip toggles combine with OR semantics', () => {
    renderBar([{ key: 'tags', label: 'Tags', type: 'enum', multi: true }]);
    // Chip options derived from loaded items
    expect(screen.getByTestId('filter-chip-tags-breakfast')).toBeInTheDocument();
    expect(screen.getByTestId('filter-chip-tags-vegan')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('filter-chip-tags-breakfast'));
    expect(screen.getAllByRole('listitem')).toHaveLength(2);

    fireEvent.click(screen.getByTestId('filter-chip-tags-dinner'));
    // breakfast OR dinner
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('enum single filter renders a select with derived options', () => {
    renderBar([{ key: 'title', label: 'Title', type: 'enum' }]);
    const select = screen.getByTestId('filter-enum-title') as HTMLSelectElement;
    expect(select).toBeInTheDocument();
    expect(
      Array.from(select.options).map((o) => o.value),
    ).toEqual(['', 'Pancakes', 'Tofu Stir Fry', 'Vegan Pancakes']);
    fireEvent.change(select, { target: { value: 'Pancakes' } });
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('initialValues populate the inputs on mount', () => {
    renderBar(
      [{ key: 'title', label: 'Title', type: 'text' }],
      { title: 'tofu' },
    );
    const input = screen.getByTestId('filter-text-title') as HTMLInputElement;
    expect(input.value).toBe('tofu');
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByTestId('item-3')).toBeInTheDocument();
  });

  it('renders "None yet" when a multi enum has no derived options', () => {
    render(
      <ModuleFiltersProvider
        moduleId="recipes"
        decls={[{ key: 'tags', label: 'Tags', type: 'enum', multi: true }]}
        items={[] as Recipe[]}
      >
        <FilterBar />
      </ModuleFiltersProvider>,
    );
    expect(screen.getByText(/none yet/i)).toBeInTheDocument();
  });

  it('boolean filter toggles the list', () => {
    interface Row {
      id: string;
      archived: boolean;
    }
    const rows: Row[] = [
      { id: 'a', archived: true },
      { id: 'b', archived: false },
    ];
    function Consumer() {
      const items = useFilteredItems<Row>();
      return <div data-testid="count">{items.length}</div>;
    }
    render(
      <ModuleFiltersProvider
        moduleId="x"
        decls={[{ key: 'archived', label: 'Archived', type: 'boolean' }]}
        items={rows}
      >
        <FilterBar />
        <Consumer />
      </ModuleFiltersProvider>,
    );
    // Use a spy-free interaction: click the checkbox and check count changes
    // via the filteredItems output. shadcn's Checkbox may not be a native
    // input, so drive state via fireEvent.click.
    expect(screen.getByTestId('count').textContent).toBe('2');
    // This bit is UI-shape-sensitive — if it breaks, we still cover the
    // boolean semantics in applyFilters.test.ts.
    const trigger = screen.getByTestId('filter-boolean-archived');
    fireEvent.click(trigger);
    expect(screen.getByTestId('count').textContent).toBe('1');
    // Silence unused var lint
    void vi;
  });
});
