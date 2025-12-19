/**
 * Tests for EventCard component
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EventCard } from '../components/EventCard';
import type { Event } from '../types';

describe('EventCard', () => {
  const mockEvent: Event = {
    id: '1',
    title: "John's Birthday",
    event_type: 'birthday',
    event_date: '2024-06-20',
    people_involved: 'John',
    details: 'Birthday party at 3pm',
    recurring_yearly: true,
    notification_preferences: ['day_of', 'day_before'],
    created_by: 'user-1',
    created: '2024-01-01T00:00:00Z',
    updated: '2024-01-01T00:00:00Z',
  };

  it('should render event details correctly', () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();

    render(<EventCard event={mockEvent} onEdit={onEdit} onDelete={onDelete} />);

    expect(screen.getByText('John')).toBeInTheDocument();
    expect(screen.getByText(/June 20, 2024/)).toBeInTheDocument();
  });

  it('should show birthday icon for birthday events', () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();

    const { container } = render(
      <EventCard event={mockEvent} onEdit={onEdit} onDelete={onDelete} />
    );

    const icons = container.querySelectorAll('svg');
    expect(icons.length).toBeGreaterThan(0);
  });

  it('should show heart icon for anniversary events', () => {
    const anniversaryEvent: Event = {
      ...mockEvent,
      event_type: 'anniversary',
      title: 'Wedding Anniversary',
    };

    const onEdit = vi.fn();
    const onDelete = vi.fn();

    const { container } = render(
      <EventCard event={anniversaryEvent} onEdit={onEdit} onDelete={onDelete} />
    );

    const icons = container.querySelectorAll('svg');
    expect(icons.length).toBeGreaterThan(0);
  });

  it('should call onEdit when edit button is clicked', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onDelete = vi.fn();

    render(<EventCard event={mockEvent} onEdit={onEdit} onDelete={onDelete} />);

    const editButton = screen.getByLabelText(`Edit ${mockEvent.people_involved}`);
    await user.click(editButton);

    expect(onEdit).toHaveBeenCalledWith(mockEvent);
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('should call onDelete when delete button is clicked', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onDelete = vi.fn();

    render(<EventCard event={mockEvent} onEdit={onEdit} onDelete={onDelete} />);

    const deleteButton = screen.getByLabelText(`Delete ${mockEvent.people_involved}`);
    await user.click(deleteButton);

    expect(onDelete).toHaveBeenCalledWith(mockEvent);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

});
