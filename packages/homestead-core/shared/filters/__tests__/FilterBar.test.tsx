import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppFiltersProvider, useFilteredItems } from '../FiltersContext';
import { FilterBar } from '../FilterBar';
import type { AppFilterDecl } from '../types';

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
  decls: AppFilterDecl[],
  initialValues?: Record<string, unknown>,
) {
  return render(
    <AppFiltersProvider
      appId="recipes"
      decls={decls}
      items={RECIPES}
      initialValues={initialValues}
    >
      <FilterBar />
      <ListOutput />
    </AppFiltersProvider>,
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

  it('enum multi options toggle with OR semantics', () => {
    renderBar([{ key: 'tags', label: 'Tags', type: 'enum', multi: true }]);
    const trigger = screen.getByTestId('filter-enum-multi-tags');
    expect(trigger).toHaveTextContent('Any');
    fireEvent.click(trigger);
    // Options derived from loaded items
    expect(screen.getByTestId('filter-chip-tags-breakfast')).toBeInTheDocument();
    expect(screen.getByTestId('filter-chip-tags-vegan')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('filter-chip-tags-breakfast'));
    expect(screen.getAllByRole('listitem')).toHaveLength(2);

    fireEvent.click(screen.getByTestId('filter-chip-tags-dinner'));
    // breakfast OR dinner
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('enum multi orders options by use, searches, summarises and clears', () => {
    renderBar([{ key: 'tags', label: 'Tags', type: 'enum', multi: true }]);
    const trigger = screen.getByTestId('filter-enum-multi-tags');
    fireEvent.click(trigger);
    const panel = screen.getByTestId('filter-enum-multi-panel-tags');
    const rows = Array.from(panel.querySelectorAll('[data-testid^="filter-chip-tags-"]'));
    // breakfast ×2, vegan ×2, dinner ×1 — most used first, ties alphabetical.
    expect(rows.map((r) => r.textContent)).toEqual(['breakfast2', 'vegan2', 'dinner1']);

    fireEvent.click(screen.getByTestId('filter-chip-tags-vegan'));
    expect(trigger).toHaveTextContent('vegan');
    fireEvent.click(screen.getByTestId('filter-chip-tags-dinner'));
    fireEvent.click(screen.getByTestId('filter-chip-tags-breakfast'));
    expect(trigger).toHaveTextContent('3 selected');

    fireEvent.click(screen.getByTestId('filter-enum-multi-clear-tags'));
    expect(trigger).toHaveTextContent('Any');
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('enum multi shows a search box once options get long', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      title: `R${i}`,
      tags: [`tag-${i}`],
    }));
    render(
      <AppFiltersProvider
        appId="recipes"
        decls={[{ key: 'tags', label: 'Tags', type: 'enum', multi: true }]}
        items={many}
      >
        <FilterBar />
      </AppFiltersProvider>,
    );
    fireEvent.click(screen.getByTestId('filter-enum-multi-tags'));
    fireEvent.change(screen.getByTestId('filter-enum-multi-search-tags'), {
      target: { value: 'tag-3' },
    });
    expect(screen.getByTestId('filter-chip-tags-tag-3')).toBeInTheDocument();
    expect(screen.queryByTestId('filter-chip-tags-tag-4')).not.toBeInTheDocument();
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
      <AppFiltersProvider
        appId="recipes"
        decls={[{ key: 'tags', label: 'Tags', type: 'enum', multi: true }]}
        items={[] as Recipe[]}
      >
        <FilterBar />
      </AppFiltersProvider>,
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
      <AppFiltersProvider
        appId="x"
        decls={[{ key: 'archived', label: 'Archived', type: 'boolean' }]}
        items={rows}
      >
        <FilterBar />
        <Consumer />
      </AppFiltersProvider>,
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
