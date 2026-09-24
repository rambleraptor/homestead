/**
 * Tests for RecipeForm component.
 *
 * Regression coverage for editing a recipe whose stored ingredients are
 * partially populated — records written by the chat/MCP tools, importers, or
 * older data can omit `unit`/`raw`/`qty`, which the schema doesn't require.
 * Submitting the form used to throw `Cannot read properties of undefined
 * (reading 'trim')` on those missing fields.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecipeForm } from '../components/RecipeForm';
import type { Recipe, RecipeIngredient } from '../types';

const baseRecipe = (
  ingredients: Partial<RecipeIngredient>[],
): Recipe => ({
  id: '1',
  path: 'recipes/1',
  title: 'Scrambled Eggs',
  parsed_ingredients: ingredients as RecipeIngredient[],
  create_time: '2024-01-01',
  update_time: '2024-01-01',
});

describe('RecipeForm', () => {
  it('submits when editing a recipe whose ingredients omit unit/raw/qty', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onCancel = vi.fn();

    // An ingredient as the chat/MCP tools might have written it: only `item`.
    const initialData = baseRecipe([{ item: 'eggs' }]);

    render(
      <RecipeForm onSubmit={onSubmit} onCancel={onCancel} initialData={initialData} />,
    );

    const title = screen.getByLabelText(/Title/i);
    await user.clear(title);
    await user.type(title, 'Fancy Eggs');

    await user.click(screen.getByTestId('recipe-form-submit'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.title).toBe('Fancy Eggs');
    expect(payload.parsed_ingredients).toEqual([
      expect.objectContaining({ item: 'eggs', unit: '', qty: 0 }),
    ]);
  });

  it('normalizes partial ingredient fields to empty strings in the inputs', () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();

    render(
      <RecipeForm
        onSubmit={onSubmit}
        onCancel={onCancel}
        initialData={baseRecipe([{ item: 'flour' }])}
      />,
    );

    // Missing unit renders as an empty (not `undefined`) controlled input.
    expect(screen.getByTestId('ingredient-unit-0')).toHaveValue('');
    expect(screen.getByTestId('ingredient-item-0')).toHaveValue('flour');
  });

  it('trims ingredient sections into the payload and starts new rows in the same section', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <RecipeForm
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        initialData={baseRecipe([{ item: 'stock', qty: 1, unit: 'cup', raw: '1 cup stock' }])}
      />,
    );

    await user.type(screen.getByTestId('ingredient-group-0'), '  For the sauce ');
    await user.click(screen.getByTestId('add-ingredient-button'));
    expect(screen.getByTestId('ingredient-group-1')).toHaveValue('For the sauce');
    await user.type(screen.getByTestId('ingredient-item-1'), 'butter');

    await user.click(screen.getByTestId('recipe-form-submit'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.parsed_ingredients).toEqual([
      expect.objectContaining({ item: 'stock', group: 'For the sauce' }),
      expect.objectContaining({ item: 'butter', group: 'For the sauce' }),
    ]);
  });
});
