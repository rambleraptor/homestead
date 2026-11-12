/**
 * The per-record visibility controls: the create-form picker and the
 * read-only badge. Both read the resource's `access` declaration from the
 * registry, and both must stay out of the way for a resource without one.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { initializeAppRegistry, resetAppRegistry } from '../../apps/registry';
import type { AppConfig } from '../../apps/types';
import { VisibilityBadge } from '../components/VisibilityBadge';
import { VisibilityPicker } from '../components/VisibilityPicker';
import { isPrivateRecord, recordVisibility } from '../visibility';

const app: AppConfig = {
  id: 'clippings',
  name: 'Clippings',
  description: 'Test app',
  resources: [
    {
      singular: 'clipping',
      plural: 'clippings',
      access: { model: 'per-record', field: 'audience', sharedValue: 'everyone', privateValue: 'me' },
      fields: {
        title: { type: 'string' },
        audience: { type: 'string', enum: ['everyone', 'me'], default: 'everyone', immutable: true },
      },
    },
    { singular: 'plain-thing', plural: 'plain-things', fields: { title: { type: 'string' } } },
  ],
};

beforeEach(() => initializeAppRegistry([app]));
afterEach(() => resetAppRegistry());

describe('recordVisibility', () => {
  it('reads a per-record resource’s field, values and default', () => {
    expect(recordVisibility('clipping')).toEqual({
      field: 'audience',
      sharedValue: 'everyone',
      privateValue: 'me',
      defaultValue: 'everyone',
    });
  });

  it('is null for a resource with no such choice, or one that does not exist', () => {
    expect(recordVisibility('plain-thing')).toBeNull();
    expect(recordVisibility('nope')).toBeNull();
  });

  it('reads a record with the field unset as the default', () => {
    expect(isPrivateRecord('clipping', { audience: 'me' })).toBe(true);
    expect(isPrivateRecord('clipping', { audience: 'everyone' })).toBe(false);
    expect(isPrivateRecord('clipping', {})).toBe(false);
    expect(isPrivateRecord('plain-thing', { audience: 'me' })).toBe(false);
  });
});

describe('VisibilityPicker', () => {
  it('offers the two kinds and reports the one chosen, by the resource’s own values', () => {
    const onChange = vi.fn();
    render(<VisibilityPicker singular="clipping" value="everyone" onChange={onChange} />);

    expect(screen.getByRole('radio', { name: 'Family' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Private' })).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(screen.getByRole('radio', { name: 'Private' }));
    expect(onChange).toHaveBeenCalledWith('me');
  });

  it('shows the default for a value it does not know', () => {
    render(<VisibilityPicker singular="clipping" value="" onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: 'Family' })).toHaveAttribute('aria-checked', 'true');
  });

  it('keeps its labels for screen readers when compact', () => {
    render(<VisibilityPicker singular="clipping" value="me" onChange={() => {}} compact />);
    expect(screen.getByRole('radio', { name: 'Private' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByText('Private')).not.toBeInTheDocument();
  });

  it('renders nothing for a resource with no such choice', () => {
    const { container } = render(<VisibilityPicker singular="plain-thing" value="" onChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('VisibilityBadge', () => {
  it('marks a private record', () => {
    render(<VisibilityBadge singular="clipping" record={{ audience: 'me' }} />);
    expect(screen.getByTestId('visibility-badge-private')).toHaveTextContent('Private');
  });

  it('marks a household record only when asked to', () => {
    const { container, rerender } = render(<VisibilityBadge singular="clipping" record={{ audience: 'everyone' }} />);
    expect(container).toBeEmptyDOMElement();

    rerender(<VisibilityBadge singular="clipping" record={{ audience: 'everyone' }} showShared />);
    expect(screen.getByTestId('visibility-badge-shared')).toHaveTextContent('Family');
  });

  it('renders nothing for a resource with no such choice', () => {
    const { container } = render(<VisibilityBadge singular="plain-thing" record={{ audience: 'me' }} showShared />);
    expect(container).toBeEmptyDOMElement();
  });
});
