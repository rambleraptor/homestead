/**
 * CredentialsHome: values show only as their descriptor, and an instance with
 * no master key says so — with Add disabled — before anyone fills in a form.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CredentialsHome } from '../CredentialsHome';
import type { Credential, CredentialSlotStatus } from '../../types';

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
    id: 'c3',
    path: 'credentials/c3',
    name: 'Calendar sign-in',
    kind: 'oauth',
    value: { $secret: true, set: false },
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

const slots = vi.hoisted(() => ({ list: [] as CredentialSlotStatus[] }));

const security = vi.hoisted(() => ({ encryptionEnabled: true }));

vi.mock('../../../mcp-servers/hooks/useMcpServers', () => ({
  useMcpServers: () => ({
    data: [{ id: 'ha', name: 'Home Assistant', url: 'http://ha.local/mcp', credential: 'credentials/c1' }],
  }),
}));

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
    useSetSlotCredential: mutation,
    useCredentialSlots: () => ({ data: slots.list, isLoading: false, error: null }),
  };
});

describe('CredentialsHome', () => {
  beforeEach(() => {
    security.encryptionEnabled = true;
    slots.list = [];
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

  it('shows an OAuth sign-in as one, managed from its server rather than edited here', () => {
    render(<CredentialsHome />);
    expect(screen.getByTestId('credential-value-c3')).toHaveTextContent('OAuth sign-in · not connected');
    expect(screen.queryByTestId('edit-credential-c3')).not.toBeInTheDocument();
    expect(screen.getByTestId('delete-credential-c3')).toBeInTheDocument();
  });

  it('says which MCP servers use a credential', () => {
    render(<CredentialsHome />);
    expect(screen.getByTestId('credential-used-by-c1')).toHaveTextContent('Used by Home Assistant (MCP server)');
    expect(screen.queryByTestId('credential-used-by-c2')).not.toBeInTheDocument();
  });

  describe('Homestead needs', () => {
    const slot = (over: Partial<CredentialSlotStatus>): CredentialSlotStatus => ({
      id: 'ai-api-key',
      label: 'AI provider API key',
      env: 'AI_API_KEY',
      used_by: 'Assistant',
      source: 'missing',
      stored: null,
      overridden: false,
      ...over,
    });

    it('shows a missing slot with its env var, where to get one, and Set', () => {
      slots.list = [slot({ help: 'https://aistudio.google.com/apikey' })];
      render(<CredentialsHome />);
      expect(screen.getByTestId('slot-ai-api-key')).toHaveTextContent('AI_API_KEY');
      expect(screen.getByTestId('slot-status-ai-api-key')).toHaveTextContent('Missing');
      expect(screen.getByRole('link', { name: /get a key/i })).toHaveAttribute(
        'href',
        'https://aistudio.google.com/apikey',
      );
      expect(screen.getByTestId('set-slot-ai-api-key')).toHaveTextContent('Set');
      expect(screen.queryByTestId('clear-slot-ai-api-key')).not.toBeInTheDocument();
    });

    it('a stored slot offers Replace and Clear, and stays out of the other credentials', () => {
      slots.list = [
        slot({
          id: 'c2',
          source: 'stored',
          stored: { $secret: true, set: true, hint: '…beef', set_time: '2026-10-26T14:02:11Z' },
        }),
      ];
      render(<CredentialsHome />);
      expect(screen.getByTestId('slot-status-c2').textContent).toMatch(/^Set here · …beef · /);
      expect(screen.getByTestId('set-slot-c2')).toHaveTextContent('Replace');
      expect(screen.getByTestId('clear-slot-c2')).toBeInTheDocument();
      expect(screen.queryByTestId('credential-c2')).not.toBeInTheDocument();
      expect(screen.getByTestId('credential-c1')).toBeInTheDocument();
    });

    it('a slot set by its env var can’t be set here, and says a stored value is overridden', () => {
      slots.list = [
        slot({ source: 'env', stored: { $secret: true, set: true }, overridden: true }),
      ];
      render(<CredentialsHome />);
      expect(screen.getByTestId('slot-status-ai-api-key')).toHaveTextContent(
        'From the environment variable AI_API_KEY',
      );
      expect(screen.queryByTestId('set-slot-ai-api-key')).not.toBeInTheDocument();
      expect(screen.getByTestId('slot-overridden-ai-api-key')).toHaveTextContent('AI_API_KEY one wins');
      expect(screen.getByTestId('clear-slot-ai-api-key')).toBeInTheDocument();
    });
  });
});
