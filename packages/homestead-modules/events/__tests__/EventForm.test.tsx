/**
 * Tests for EventForm
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EventForm } from '../components/EventForm';
import type { UseQueryResult } from '@tanstack/react-query';
import type { Person } from '../../people/types';

vi.mock('../../people/hooks/usePeople', () => ({
  usePeople: vi.fn(),
}));

import { usePeople } from '../../people/hooks/usePeople';

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

const samplePeople: Person[] = [
  {
    id: 'p1',
    name: 'Alice',
    addresses: [],
    created_by: 'u1',
    created: '',
    updated: '',
  },
  {
    id: 'p2',
    name: 'Bob',
    addresses: [],
    created_by: 'u1',
    created: '',
    updated: '',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(usePeople).mockReturnValue({
    data: samplePeople,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as UseQueryResult<Person[]>);
});

describe('EventForm', () => {
  it('submits a new event with the chosen tag and tagged people', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onCancel = vi.fn();

    renderWithClient(
      <EventForm onSubmit={onSubmit} onCancel={onCancel} />,
    );

    await user.type(screen.getByTestId('event-form-name'), 'Test Event');
    await user.type(screen.getByTestId('event-form-date'), '1990-06-20');
    await user.selectOptions(screen.getByTestId('event-form-tag'), 'birthday');
    await user.click(screen.getByTestId('event-form-person-p1'));

    await user.click(screen.getByTestId('event-form-submit'));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Test Event',
      date: '1990-06-20',
      tag: 'birthday',
      people: ['people/p1'],
    });
  });

  it('supports a custom tag entered free-form', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithClient(
      <EventForm onSubmit={onSubmit} onCancel={vi.fn()} />,
    );

    await user.type(screen.getByTestId('event-form-name'), 'Graduation');
    await user.type(screen.getByTestId('event-form-date'), '2020-05-30');
    await user.selectOptions(
      screen.getByTestId('event-form-tag'),
      '__custom__',
    );
    await user.type(
      screen.getByTestId('event-form-tag-custom'),
      'graduation',
    );
    await user.click(screen.getByTestId('event-form-submit'));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      tag: 'graduation',
    });
  });

  it('hydrates from initialData (date + tag + people)', async () => {
    const onSubmit = vi.fn();
    renderWithClient(
      <EventForm
        initialData={{
          id: 'e1',
          name: 'Existing',
          date: '1990-06-20',
          tag: 'anniversary',
          people: ['people/p2'],
        }}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByTestId('event-form-name')).toHaveValue('Existing');
    expect(screen.getByTestId('event-form-date')).toHaveValue('1990-06-20');
    expect(screen.getByTestId('event-form-tag')).toHaveValue('anniversary');
    expect(
      screen.getByTestId('event-form-person-p2'),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByTestId('event-form-person-p1'),
    ).toHaveAttribute('aria-pressed', 'false');
  });
});
