/**
 * Tests for PersonCard component
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { PersonCard } from '../components/PersonCard';
import type { Person } from '../types';

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('PersonCard', () => {
  const mockPerson: Person = {
    id: '1',
    name: 'John Doe',
    aliases: [],
    households: [{
      id: 'household-1',
      name: 'Doe home',
      members: ['1'],
      line1: '123 Main St',
      city: 'Anytown',
      state: 'USA',
    }],
    parents: [],
    children: [],
    siblings: [],
    created_by: 'user-1',
    created: '2024-01-01T00:00:00Z',
    updated: '2024-01-01T00:00:00Z',
  };

  beforeEach(() => {
    vi.mocked(aepbase.list).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should render person details correctly', () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();

    renderWithClient(<PersonCard person={mockPerson} onEdit={onEdit} onDelete={onDelete} />);

    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('123 Main St, Anytown, USA')).toBeInTheDocument();
  });

  it('should display map icon and link for address when address is present', () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();

    renderWithClient(<PersonCard person={mockPerson} onEdit={onEdit} onDelete={onDelete} />);
    const mapLink = screen.getByText('123 Main St, Anytown, USA');
    expect(mapLink).toBeInTheDocument();
    expect(mapLink.closest('a')).toHaveAttribute(
      'href',
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        '123 Main St, Anytown, USA'
      )}`
    );
    expect(screen.getByLabelText('Map pin icon')).toBeInTheDocument();
  });

  it('should call onEdit from the actions menu', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onDelete = vi.fn();

    renderWithClient(<PersonCard person={mockPerson} onEdit={onEdit} onDelete={onDelete} />);

    await user.click(screen.getByLabelText(`More actions for ${mockPerson.name}`));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit' }));

    expect(onEdit).toHaveBeenCalledWith(mockPerson);
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('should call onDelete from the actions menu', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onDelete = vi.fn();

    renderWithClient(<PersonCard person={mockPerson} onEdit={onEdit} onDelete={onDelete} />);

    await user.click(screen.getByLabelText(`More actions for ${mockPerson.name}`));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));

    expect(onDelete).toHaveBeenCalledWith(mockPerson);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("renders the person's birthday and anniversary events", async () => {
    vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));
    vi.mocked(aepbase.list).mockImplementation(async (plural: string) => {
      if (plural === 'events') {
        return [
          {
            id: 'e1',
            name: "John's Birthday",
            month: 7,
            day: 4,
            tag: 'birthday',
            people: ['people/1'],
          },
          {
            id: 'e2',
            name: 'Anniversary',
            month: 8,
            day: 15,
            tag: 'anniversary',
            people: ['people/1', 'people/2'],
          },
          {
            id: 'e3',
            name: "Someone Else's Birthday",
            month: 9,
            day: 20,
            tag: 'birthday',
            people: ['people/2'],
          },
        ];
      }
      return [];
    });

    renderWithClient(
      <PersonCard person={mockPerson} onEdit={vi.fn()} onDelete={vi.fn()} />,
    );

    await waitFor(() =>
      expect(screen.getByTestId('person-event-e1')).toBeInTheDocument(),
    );
    expect(screen.getByLabelText('Cake icon')).toBeInTheDocument();
    expect(screen.getByLabelText('Heart icon')).toBeInTheDocument();
    expect(screen.getByTestId('person-event-e1')).toHaveTextContent('Birthday Jul 4');
    expect(screen.getByTestId('person-event-e2')).toHaveTextContent('Anniversary Aug 15');
    expect(screen.queryByTestId('person-event-e3')).not.toBeInTheDocument();
  });

  it('flags an event coming up within two weeks', async () => {
    vi.setSystemTime(new Date('2024-07-01T12:00:00'));
    vi.mocked(aepbase.list).mockImplementation(async (plural: string) =>
      plural === 'events'
        ? [{ id: 'e1', name: 'Bday', month: 7, day: 4, tag: 'birthday', people: ['1'] }]
        : [],
    );

    renderWithClient(<PersonCard person={mockPerson} onEdit={vi.fn()} onDelete={vi.fn()} />);

    await waitFor(() =>
      expect(screen.getByTestId('person-event-e1')).toHaveTextContent('Birthday Jul 4 · in 3 days'),
    );
  });

  it('names the partner as a link to their page', () => {
    renderWithClient(
      <PersonCard
        person={{ ...mockPerson, partner: { id: '2', name: 'Jane Doe' } }}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    const partner = screen.getByTestId('person-partner-1');
    expect(partner).toHaveTextContent('Jane Doe');
    expect(partner).toHaveAttribute('href', '/people/2');
  });

  it('keeps WiFi off the card and names households only when there are several', () => {
    const withWifi = { ...mockPerson.households[0], wifi_network: 'DoeNet', wifi_password: 'secret' };
    const { unmount } = renderWithClient(
      <PersonCard person={{ ...mockPerson, households: [withWifi] }} onEdit={vi.fn()} onDelete={vi.fn()} />,
    );
    expect(screen.queryByText(/DoeNet/)).not.toBeInTheDocument();
    expect(screen.queryByText(/secret/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Doe home/)).not.toBeInTheDocument();
    unmount();

    const lake = { id: 'household-2', name: 'Lake house', members: ['1'], line1: '9 Lake Rd' };
    renderWithClient(
      <PersonCard
        person={{ ...mockPerson, households: [withWifi, lake] }}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText(/Doe home/)).toBeInTheDocument();
    expect(screen.getByText(/Lake house/)).toBeInTheDocument();
  });
});
