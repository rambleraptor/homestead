import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecipeIngredients } from '../RecipeIngredients';
import { RecipeSteps } from '../RecipeSteps';
import type { RecipeIngredient } from '../../types';

const ingredients: RecipeIngredient[] = [
  { item: 'chicken breasts', qty: 2, unit: '', raw: '2 chicken breasts' },
  { item: 'stock', qty: 1, unit: 'cup', raw: '1 cup stock', group: 'For the sauce' },
  { item: 'butter', qty: 2, unit: 'tbsp', raw: '2 tbsp butter', group: 'For the sauce' },
];

describe('RecipeIngredients', () => {
  it('renders ingredients under their section headings', () => {
    render(
      <RecipeIngredients
        ingredients={ingredients}
        cookMode={false}
        checked={new Set()}
        onToggle={vi.fn()}
      />,
    );

    const heading = screen.getByTestId('recipe-view-ingredient-group-1');
    expect(heading).toHaveTextContent('For the sauce');
    const section = heading.parentElement!;
    expect(within(section).getByText('stock')).toBeInTheDocument();
    expect(within(section).getByText('butter')).toBeInTheDocument();
    expect(within(section).queryByText('chicken breasts')).not.toBeInTheDocument();
    // Nothing is tappable outside cook mode.
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('turns ingredients into check-off toggles in cook mode', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <RecipeIngredients
        ingredients={ingredients}
        cookMode
        checked={new Set([1])}
        onToggle={onToggle}
      />,
    );

    expect(screen.getByTestId('recipe-view-ingredient-1')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('recipe-view-ingredient-2')).toHaveAttribute('aria-pressed', 'false');

    await user.click(screen.getByTestId('recipe-view-ingredient-2'));
    expect(onToggle).toHaveBeenCalledWith(2);
  });
});

describe('RecipeSteps', () => {
  const steps = ['Sear the chicken.', 'Make the sauce.'];

  it('numbers each step', () => {
    render(<RecipeSteps steps={steps} cookMode={false} currentStep={null} onSelectStep={vi.fn()} />);
    const items = within(screen.getByTestId('recipe-view-steps')).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[1]).toHaveTextContent('2');
    expect(items[1]).toHaveTextContent('Make the sauce.');
  });

  it('marks the selected step as current in cook mode', async () => {
    const user = userEvent.setup();
    const onSelectStep = vi.fn();
    render(<RecipeSteps steps={steps} cookMode currentStep={0} onSelectStep={onSelectStep} />);

    expect(screen.getByTestId('recipe-view-step-0')).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByTestId('recipe-view-step-1'));
    expect(onSelectStep).toHaveBeenCalledWith(1);
  });
});
