/**
 * Tests for `<SchemaForm>`: generation from a resource schema, the sparse
 * `fields` override diff, schema-derived validation, server-error mapping, and
 * the payload handed to `onSubmit`.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { SchemaForm } from '../SchemaForm';
import { mapServerError } from '../validation';
import type { FieldWidgetProps } from '../types';
import type { ResourceDefinition } from '../../../resources/types';

const def: ResourceDefinition = {
  singular: 'widget',
  plural: 'widgets',
  fields: {
    name: { type: 'string', required: true },
    amount: { type: 'number', required: true, minimum: 0 },
    code: { type: 'string', pattern: '^[0-9]{4}$' },
    kind: { type: 'string', enum: ['a', 'b'] },
    notes: { type: 'string' },
    created_by: { type: 'string', reference: { resource: 'user' } },
  },
};

function renderForm(props: Partial<React.ComponentProps<typeof SchemaForm>> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(<SchemaForm resource={def} onSubmit={onSubmit} {...props} />);
  return { onSubmit };
}

describe('SchemaForm generation', () => {
  it('renders a labeled control per schema field', () => {
    renderForm();
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Amount')).toBeInTheDocument();
    expect(screen.getByText('Kind')).toBeInTheDocument();
  });

  it('auto-hides references to the built-in user root (created_by)', () => {
    renderForm();
    expect(screen.queryByText('Created By')).not.toBeInTheDocument();
  });

  it('renders a select for an enum field with its options', () => {
    renderForm();
    expect(screen.getByRole('option', { name: 'A' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'B' })).toBeInTheDocument();
  });
});

describe('SchemaForm fields diff', () => {
  it('applies a sparse label override', () => {
    renderForm({ fields: { name: { label: 'Full Name' } } });
    expect(screen.getByText('Full Name')).toBeInTheDocument();
    expect(screen.queryByText('Name')).not.toBeInTheDocument();
  });

  it('hides a field marked hidden', () => {
    renderForm({ fields: { notes: { hidden: true } } });
    expect(screen.queryByText('Notes')).not.toBeInTheDocument();
  });

  it('renders a custom widget override', () => {
    const Custom = (p: FieldWidgetProps) => (
      <div data-testid="custom-notes">custom:{String(p.value)}</div>
    );
    renderForm({ fields: { notes: { widget: Custom } } });
    expect(screen.getByTestId('custom-notes')).toBeInTheDocument();
  });
});

describe('SchemaForm validation', () => {
  it('blocks submit and shows a message when a required field is empty', async () => {
    const { onSubmit } = renderForm();
    fireEvent.submit(screen.getByRole('button', { name: /create/i }).closest('form')!);
    await waitFor(() => expect(screen.getByText('Name is required')).toBeInTheDocument());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('enforces a numeric minimum from the schema', async () => {
    const { onSubmit } = renderForm({ initialData: { name: 'W', amount: -5 } });
    fireEvent.submit(document.querySelector('form')!);
    await waitFor(() => expect(screen.getByText('Amount must be at least 0')).toBeInTheDocument());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('enforces a string pattern only when the optional field is filled', async () => {
    const { onSubmit } = renderForm({ initialData: { name: 'W', amount: 1, code: '12' } });
    fireEvent.submit(document.querySelector('form')!);
    await waitFor(() =>
      expect(screen.getByText('Code is not in the expected format')).toBeInTheDocument(),
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('SchemaForm submit payload', () => {
  it('sends required fields and omits blank optionals', async () => {
    const { onSubmit } = renderForm({ initialData: { name: 'Widget A', amount: 12 } });
    fireEvent.submit(document.querySelector('form')!);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({ name: 'Widget A', amount: 12 });
  });

  it('maps an engine constraint error back onto the field', async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValue(new Error('field "amount" must be <= 100'));
    render(<SchemaForm resource={def} onSubmit={onSubmit} initialData={{ name: 'W', amount: 12 }} />);
    fireEvent.submit(document.querySelector('form')!);
    await waitFor(() =>
      expect(screen.getByText('field "amount" must be <= 100')).toBeInTheDocument(),
    );
  });
});

describe('SchemaForm accessibility', () => {
  it('conveys required via aria-required, not the native attribute', () => {
    renderForm();
    const nameInput = screen.getByLabelText(/name/i);
    expect(nameInput).toHaveAttribute('aria-required', 'true');
    expect(nameInput).not.toHaveAttribute('required');
  });

  it('links the inline error to its control via aria-describedby', async () => {
    renderForm();
    fireEvent.submit(document.querySelector('form')!);
    await waitFor(() => expect(screen.getByText('Name is required')).toBeInTheDocument());

    const nameInput = screen.getByLabelText(/name/i);
    expect(nameInput).toHaveAttribute('aria-invalid', 'true');
    const describedBy = nameInput.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const errorEl = document.getElementById(describedBy!.split(' ').pop()!);
    expect(errorEl).toHaveTextContent('Name is required');
  });
});

describe('SchemaForm groups', () => {
  it('renders declared groups as titled sections holding their fields', () => {
    renderForm({
      layout: {
        groups: [
          { id: 'details', title: 'Details' },
          { id: 'meta', title: 'Metadata' },
        ],
      },
      fields: { code: { group: 'details' }, notes: { group: 'meta' } },
    });

    const details = screen.getByRole('group', { name: 'Details' });
    const meta = screen.getByRole('group', { name: 'Metadata' });
    expect(within(details).getByLabelText(/code/i)).toBeInTheDocument();
    expect(within(meta).getByLabelText(/notes/i)).toBeInTheDocument();
    // An ungrouped field is not inside either titled section.
    expect(within(details).queryByLabelText(/name/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
  });

  it('stays flat (no group role) when no groups are declared', () => {
    renderForm();
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
  });
});

describe('mapServerError', () => {
  it('maps a single-field constraint error', () => {
    expect(mapServerError('field "amount" must be > 0', ['amount', 'name'])).toEqual({
      amount: 'field "amount" must be > 0',
    });
  });

  it('maps a multi-field required error onto each known field', () => {
    expect(
      mapServerError('missing required fields: merchant, amount', ['merchant', 'amount', 'notes']),
    ).toEqual({ merchant: 'Merchant is required', amount: 'Amount is required' });
  });

  it('returns an empty map when no known field is named', () => {
    expect(mapServerError('database is on fire', ['a'])).toEqual({});
    expect(mapServerError('field "ghost" must be a string', ['a'])).toEqual({});
  });
});

describe('SchemaForm disableSubmitUntilValid', () => {
  it('disables submit until every field is valid', async () => {
    renderForm({ disableSubmitUntilValid: true });
    const submit = screen.getByRole('button', { name: /create/i });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Widget' } });
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '5' } });

    await waitFor(() => expect(submit).toBeEnabled());
  });
});

describe('SchemaForm secret fields', () => {
  const credential: ResourceDefinition = {
    singular: 'credential',
    plural: 'credentials',
    fields: {
      name: { type: 'string', required: true },
      api_key: { type: 'string', secret: { hint: 4 } },
      tokens: { type: 'object', secret: true },
    },
  };
  const stored = {
    name: 'AI',
    api_key: { $secret: true, set: true, hint: '…3f9a', set_time: '2026-10-26T14:02:11Z' },
    tokens: { $secret: true, set: true },
  };
  const renderSecret = (initialData: Record<string, unknown> | null) => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <SchemaForm
        resource={credential}
        mode={initialData ? 'edit' : 'create'}
        initialData={initialData}
        fields={{ api_key: { testId: 'api-key' } }}
        onSubmit={onSubmit}
      />,
    );
    return { onSubmit };
  };
  const submit = () => fireEvent.click(screen.getByRole('button', { name: /save|create/i }));

  it('shows a stored secret as set, never its value, and leaves it alone on save', async () => {
    const { onSubmit } = renderSecret(stored);
    expect(screen.getByTestId('api-key-stored')).toHaveTextContent('Set · …3f9a');
    // Structured secrets (tokens) aren't the form's to edit.
    expect(screen.queryByText('Tokens')).not.toBeInTheDocument();
    submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ name: 'AI' }));
  });

  it('replaces it with what is typed, untrimmed', async () => {
    const { onSubmit } = renderSecret(stored);
    fireEvent.click(screen.getByTestId('api-key-replace'));
    const box = screen.getByTestId('api-key');
    expect(box).toHaveAttribute('type', 'password');
    fireEvent.change(box, { target: { value: ' sk-new ' } });
    submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ name: 'AI', api_key: ' sk-new ' }));
  });

  it('clears it, and Undo takes that back', async () => {
    const { onSubmit } = renderSecret(stored);
    fireEvent.click(screen.getByTestId('api-key-clear'));
    expect(screen.getByText('Removed when you save.')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('api-key-undo'));
    expect(screen.getByTestId('api-key-stored')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('api-key-clear'));
    submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ name: 'AI', api_key: null }));
  });

  it('starts as an empty password box on create', async () => {
    const { onSubmit } = renderSecret(null);
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'AI' } });
    expect(screen.getByTestId('api-key')).toHaveValue('');
    submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ name: 'AI' }));
  });
});
