/**
 * The searchable doc-type picker. Driven entirely by the registry, so the
 * assertions use real doc types rather than fixtures — what's tested is the
 * searching, grouping, and keyboard behaviour that the native `<select>` it
 * replaced couldn't offer.
 */

import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DocTypeCombobox } from '../components/DocTypeCombobox';
import { UNKNOWN_DOC_TYPE } from '../doc-types/docType';
import { getDocTypes } from '../doc-types/registry';

function setup(props: Partial<React.ComponentProps<typeof DocTypeCombobox>> = {}) {
  const onSelect = vi.fn();
  render(
    <DocTypeCombobox
      value=""
      onSelect={onSelect}
      placeholder="Classify as…"
      data-testid="picker"
      {...props}
    />,
  );
  return { onSelect, user: userEvent.setup() };
}

/** The doc type ids of the visible options, in render order. */
function optionIds(): string[] {
  return screen
    .getAllByRole('option')
    .map((el) => el.getAttribute('data-testid')?.replace('doc-type-option-', '') ?? '');
}

describe('DocTypeCombobox', () => {
  it('shows the placeholder while it holds no selection', () => {
    setup();
    expect(screen.getByTestId('picker')).toHaveTextContent('Classify as…');
  });

  it('shows the selected type on the trigger', () => {
    setup({ value: 'form-w2' });
    expect(screen.getByTestId('picker')).toHaveTextContent('Form W-2');
  });

  it('opens to the whole catalogue', async () => {
    const { user } = setup();
    await user.click(screen.getByTestId('picker'));
    expect(screen.getAllByRole('option')).toHaveLength(getDocTypes().length);
  });

  it('filters as you search, ignoring punctuation and word order', async () => {
    const { user } = setup();
    await user.click(screen.getByTestId('picker'));
    await user.type(screen.getByTestId('picker-search'), '1099 int');

    const ids = optionIds();
    expect(ids).toContain('form-1099-int');
    expect(ids).not.toContain('form-w2');
  });

  it('searches the description, not just the label', async () => {
    const { user } = setup();
    await user.click(screen.getByTestId('picker'));
    // "dishwasher" appears only in the appliance-manual type's description —
    // nothing in its label would find it. That's the case a native <select>
    // couldn't serve: finding a type without knowing its official name.
    await user.type(screen.getByTestId('picker-search'), 'dishwasher');
    expect(optionIds()).toContain('appliance-manual');
  });

  it('says so when nothing matches', async () => {
    const { user } = setup();
    await user.click(screen.getByTestId('picker'));
    await user.type(screen.getByTestId('picker-search'), 'zzzzz');
    expect(screen.getByTestId('picker-empty')).toBeInTheDocument();
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });

  it('groups the options by category', async () => {
    const { user } = setup();
    await user.click(screen.getByTestId('picker'));
    expect(screen.getByText('Tax')).toBeInTheDocument();
  });

  it('reports the chosen type and closes', async () => {
    const { user, onSelect } = setup();
    await user.click(screen.getByTestId('picker'));
    await user.click(screen.getByTestId('doc-type-option-form-w2'));
    expect(onSelect).toHaveBeenCalledWith('form-w2');
    expect(screen.queryByTestId('picker-panel')).not.toBeInTheDocument();
  });

  it('selects the highlighted option with the keyboard', async () => {
    const { user, onSelect } = setup();
    await user.click(screen.getByTestId('picker'));
    // A query narrow enough to leave one option, so Enter's target is exact.
    await user.type(screen.getByTestId('picker-search'), '1099-da');
    expect(optionIds()).toEqual(['form-1099-da']);
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith('form-1099-da');
  });

  it('closes on Escape without selecting', async () => {
    const { user, onSelect } = setup();
    await user.click(screen.getByTestId('picker'));
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('picker-panel')).not.toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('offers "No matching type" only when asked to', async () => {
    const { user } = setup();
    await user.click(screen.getByTestId('picker'));
    expect(
      screen.queryByTestId(`doc-type-option-${UNKNOWN_DOC_TYPE}`),
    ).not.toBeInTheDocument();
  });

  it('reports the unmatched option when offered', async () => {
    const { user, onSelect } = setup({ includeUnmatched: true, value: 'form-w2' });
    await user.click(screen.getByTestId('picker'));
    await user.click(screen.getByTestId(`doc-type-option-${UNKNOWN_DOC_TYPE}`));
    expect(onSelect).toHaveBeenCalledWith(UNKNOWN_DOC_TYPE);
  });

  it('marks the current value as the selected option', async () => {
    const { user } = setup({ value: 'form-w2' });
    await user.click(screen.getByTestId('picker'));
    expect(screen.getByTestId('doc-type-option-form-w2')).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('does not open while disabled', async () => {
    const { user } = setup({ disabled: true });
    await user.click(screen.getByTestId('picker'));
    expect(screen.queryByTestId('picker-panel')).not.toBeInTheDocument();
  });

  describe('on a phone', () => {
    const original = window.matchMedia;

    // Report every media query as matching, so the picker sees a narrow screen.
    function narrowScreen() {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: (query: string) => ({ matches: true, media: query }),
      });
    }

    afterEach(() => {
      Object.defineProperty(window, 'matchMedia', { writable: true, value: original });
    });

    it('opens as a full-screen sheet with the whole catalogue', async () => {
      narrowScreen();
      const { user } = setup();
      await user.click(screen.getByTestId('picker'));

      const sheet = screen.getByRole('dialog');
      expect(sheet).toBe(screen.getByTestId('picker-panel'));
      // Portalled to the body, out of any clipping ancestor.
      expect(sheet.parentElement).toBe(document.body);
      expect(within(sheet).getAllByRole('option')).toHaveLength(getDocTypes().length);
      // No autofocus: the keyboard would cover the list before it's been seen.
      expect(screen.getByTestId('picker-search')).not.toHaveFocus();
    });

    it('selects a tapped option and closes', async () => {
      narrowScreen();
      const { onSelect, user } = setup();
      await user.click(screen.getByTestId('picker'));
      await user.type(screen.getByTestId('picker-search'), 'charitable receipt');
      await user.click(screen.getByTestId('doc-type-option-charitable-donation-receipt'));

      expect(onSelect).toHaveBeenCalledWith('charitable-donation-receipt');
      expect(screen.queryByTestId('picker-panel')).not.toBeInTheDocument();
    });

    it('closes from its close button without selecting', async () => {
      narrowScreen();
      const { onSelect, user } = setup();
      await user.click(screen.getByTestId('picker'));
      await user.click(screen.getByTestId('picker-close'));

      expect(onSelect).not.toHaveBeenCalled();
      expect(screen.queryByTestId('picker-panel')).not.toBeInTheDocument();
    });
  });
});
