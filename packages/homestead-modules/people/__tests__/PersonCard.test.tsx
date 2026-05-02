/**
 * Tests for PersonCard component
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PersonCard } from '../components/PersonCard';
import type { Person } from '../types';

describe('PersonCard', () => {
  const mockPerson: Person = {
    id: '1',
    name: 'John Doe',
    addresses: [{
      id: 'addr-1',
      line1: '123 Main St',
      city: 'Anytown',
      state: 'USA',
      created_by: 'user-1',
      created: '2024-01-01T00:00:00Z',
      updated: '2024-01-01T00:00:00Z',
    }],
    birthday: '1990-06-20',
    anniversary: '2015-10-25',
    created_by: 'user-1',
    created: '2024-01-01T00:00:00Z',
    updated: '2024-01-01T00:00:00Z',
  };

  it('should render person details correctly', () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();

    render(<PersonCard person={mockPerson} onEdit={onEdit} onDelete={onDelete} />);

    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText(/June 20/)).toBeInTheDocument(); // Birthday (no year for annual events)
    expect(screen.getByText(/October 25/)).toBeInTheDocument(); // Anniversary (no year for annual events)
    expect(screen.getByText('123 Main St, Anytown, USA')).toBeInTheDocument(); // Address
  });

  it('should display birthday icon when birthday is present', () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();

    render(<PersonCard person={mockPerson} onEdit={onEdit} onDelete={onDelete} />);
    expect(screen.getByLabelText('Cake icon')).toBeInTheDocument(); // Assuming cake icon has a default accessible name
  });

  it('should display anniversary icon when anniversary is present', () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();

    render(<PersonCard person={mockPerson} onEdit={onEdit} onDelete={onDelete} />);
    expect(screen.getByLabelText('Heart icon')).toBeInTheDocument(); // Assuming heart icon has a default accessible name
  });

  it('should display map icon and link for address when address is present', () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();

    render(<PersonCard person={mockPerson} onEdit={onEdit} onDelete={onDelete} />);
    const mapLink = screen.getByText('123 Main St, Anytown, USA');
    expect(mapLink).toBeInTheDocument();
    expect(mapLink.closest('a')).toHaveAttribute(
      'href',
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        '123 Main St, Anytown, USA'
      )}`
    );
    expect(screen.getByLabelText('Map pin icon')).toBeInTheDocument(); // Assuming map pin icon has a default accessible name
  });

  it('should call onEdit when edit button is clicked', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onDelete = vi.fn();

    render(<PersonCard person={mockPerson} onEdit={onEdit} onDelete={onDelete} />);

    const editButton = screen.getByLabelText(`Edit ${mockPerson.name}`);
    await user.click(editButton);

    expect(onEdit).toHaveBeenCalledWith(mockPerson);
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('should call onDelete when delete button is clicked', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onDelete = vi.fn();

    render(<PersonCard person={mockPerson} onEdit={onEdit} onDelete={onDelete} />);

    const deleteButton = screen.getByLabelText(`Delete ${mockPerson.name}`);
    await user.click(deleteButton);

    expect(onDelete).toHaveBeenCalledWith(mockPerson);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
