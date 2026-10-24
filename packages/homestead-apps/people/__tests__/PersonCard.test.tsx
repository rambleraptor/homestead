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

  it('should call onEdit when edit button is clicked', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onDelete = vi.fn();

    renderWithClient(<PersonCard person={mockPerson} onEdit={onEdit} onDelete={onDelete} />);

    const editButton = screen.getByLabelText(`Edit ${mockPerson.name}`);
    await user.click(editButton);

    expect(onEdit).toHaveBeenCalledWith(mockPerson);
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('should call onDelete when delete button is clicked', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onDelete = vi.fn();

    renderWithClient(<PersonCard person={mockPerson} onEdit={onEdit} onDelete={onDelete} />);

    const deleteButton = screen.getByLabelText(`Delete ${mockPerson.name}`);
    await user.click(deleteButton);

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
            date: '1990-07-04',
            tag: 'birthday',
            people: ['people/1'],
          },
          {
            id: 'e2',
            name: 'Anniversary',
            date: '2010-08-15',
            tag: 'anniversary',
            people: ['people/1', 'people/2'],
          },
          {
            id: 'e3',
            name: "Someone Else's Birthday",
            date: '1990-09-20',
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
    expect(screen.getByText('July 4')).toBeInTheDocument();
    expect(screen.getByText('August 15')).toBeInTheDocument();
    expect(screen.queryByTestId('person-event-e3')).not.toBeInTheDocument();
  });
});
