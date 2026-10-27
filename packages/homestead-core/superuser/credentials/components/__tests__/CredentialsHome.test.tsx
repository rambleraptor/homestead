/**
 * CredentialsHome: values show only as their descriptor, and an instance with
 * no master key says so — with Add disabled — before anyone fills in a form.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CredentialsHome } from '../CredentialsHome';
import type { Credential } from '../../types';

const credentials: Credential[] = [
  {
    id: 'c1',
    path: 'credentials/c1',
    name: 'OpenAI API key',
    description: 'For the assistant',
    value: { $secret: true, set: true, hint: '…3f9a', set_time: '2026-10-26T14:02:11Z' },
    create_time: '2026-10-26T14:02:11Z',
    update_time: '2026-10-26T14:02:11Z',
  },
  {
    id: 'c2',
    path: 'credentials/c2',
    name: 'Old token',
    value: { $secret: true, set: false },
    create_time: '2026-10-26T14:02:11Z',
    update_time: '2026-10-26T14:02:11Z',
  },
];

const security = vi.hoisted(() => ({ encryptionEnabled: true }));

vi.mock('../../../homestead-information/hooks/useSecurityStatus', () => ({
  useSecurityStatus: () => ({ data: security }),
}));

vi.mock('../../hooks/useCredentials', () => {
  const mutation = () => ({ mutateAsync: vi.fn(), isPending: false });
  return {
    useCredentials: () => ({ data: credentials, isLoading: false, isError: false, error: null }),
    useCreateCredential: mutation,
    useUpdateCredential: mutation,
    useDeleteCredential: mutation,
  };
});

describe('CredentialsHome', () => {
  beforeEach(() => {
    security.encryptionEnabled = true;
  });

  it('lists credentials with their descriptor, not a value', () => {
    render(<CredentialsHome />);
    expect(screen.getByText('OpenAI API key')).toBeInTheDocument();
    expect(screen.getByTestId('credential-value-c1').textContent).toMatch(/^Set · …3f9a · /);
    expect(screen.getByTestId('credential-value-c2')).toHaveTextContent('Not set');
    expect(screen.queryByTestId('credentials-no-key')).not.toBeInTheDocument();
    expect(screen.getByTestId('add-credential-button')).toBeEnabled();
  });

  it('warns, and disables Add, when the instance has no master key', () => {
    security.encryptionEnabled = false;
    render(<CredentialsHome />);
    expect(screen.getByTestId('credentials-no-key')).toHaveTextContent('homestead key generate');
    expect(screen.getByTestId('add-credential-button')).toBeDisabled();
  });
});
