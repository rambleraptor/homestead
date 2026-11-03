import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { BulkExportContainer } from '../BulkExportContainer';

// Stub the export button so the test can read the filter/label/options the
// container derives, without exercising the download itself.
vi.mock('../BulkExportButton', () => ({
  BulkExportButton: ({
    filter,
    label,
    options,
  }: {
    filter?: string;
    label?: string;
    options?: Record<string, boolean>;
  }) => (
    <div data-testid="export-btn" data-filter={filter ?? ''} data-options={JSON.stringify(options ?? {})}>
      {label}
    </div>
  ),
}));

const people = [
  { id: 'p1', name: 'Jane Doe' },
  { id: 'p2', name: 'John Doe' },
  { id: 'p3', name: 'Peter Jones' },
];

function renderScreen() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <BulkExportContainer
          config={{ plural: 'people', appName: 'People', appNamePlural: 'people', backRoute: '/people' }}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const exportBtn = () => screen.getByTestId('export-btn');

describe('BulkExportContainer', () => {
  beforeEach(() => {
    vi.mocked(aepbase.list).mockResolvedValue(people);
  });

  it('lists records by their label and defaults to exporting all', async () => {
    renderScreen();
    expect(await screen.findByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('Peter Jones')).toBeInTheDocument();
    // Nothing selected → export everything (no filter).
    expect(exportBtn()).toHaveTextContent('Export all people');
    expect(exportBtn()).toHaveAttribute('data-filter', '');
  });

  it('exports the selection as an id filter when rows are ticked', async () => {
    renderScreen();
    await screen.findByText('Jane Doe');
    const rows = screen.getAllByTestId('export-row-checkbox');
    fireEvent.click(rows[0]); // Jane

    await waitFor(() => expect(exportBtn()).toHaveTextContent('Export 1 selected'));
    expect(exportBtn()).toHaveAttribute('data-filter', 'id in ["p1"]');
  });

  it('filters the list by the search box (and search matches labels)', async () => {
    renderScreen();
    await screen.findByText('Jane Doe');

    fireEvent.change(screen.getByTestId('export-search'), { target: { value: 'jane' } });

    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.queryByText('Peter Jones')).not.toBeInTheDocument();
  });

  it('select-all ticks every visible row', async () => {
    renderScreen();
    await screen.findByText('Jane Doe');

    fireEvent.click(screen.getByTestId('export-select-all'));

    await waitFor(() => expect(exportBtn()).toHaveTextContent('Export 3 selected'));
    expect(exportBtn()).toHaveAttribute('data-filter', 'id in ["p1", "p2", "p3"]');
  });

  it('falls back to the id when a record has no name', async () => {
    vi.mocked(aepbase.list).mockResolvedValue([{ id: 'abc123' }]);
    renderScreen();
    expect(await screen.findByText('abc123')).toBeInTheDocument();
  });

  it('shows an empty state when there is nothing to export', async () => {
    vi.mocked(aepbase.list).mockResolvedValue([]);
    renderScreen();
    expect(await screen.findByText(/No people to export yet/i)).toBeInTheDocument();
  });

  it('renders declared options and passes their values to the export', async () => {
    // The container reads options from the discovery endpoint.
    const methods = [
      {
        plural: 'people',
        verb: 'bulk-export',
        bulk_export: {
          formats: [],
          options: [
            { id: 'combine_households', type: 'boolean', default: false, label: 'Combine household members into one row' },
          ],
        },
      },
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ methods }), { status: 200 })),
    );
    try {
      renderScreen();
      const toggle = await screen.findByTestId('export-option-combine_households');
      // Default false → export carries the default.
      await waitFor(() =>
        expect(exportBtn()).toHaveAttribute('data-options', '{"combine_households":false}'),
      );

      fireEvent.click(toggle);
      await waitFor(() =>
        expect(exportBtn()).toHaveAttribute('data-options', '{"combine_households":true}'),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('narrows select-all to the filtered rows', async () => {
    renderScreen();
    await screen.findByText('Jane Doe');
    fireEvent.change(screen.getByTestId('export-search'), { target: { value: 'doe' } });

    // Only the two Does are visible; select-all should tick just them.
    const list = screen.getByRole('list');
    expect(within(list).getAllByTestId('export-row-checkbox')).toHaveLength(2);
    fireEvent.click(screen.getByTestId('export-select-all'));

    await waitFor(() => expect(exportBtn()).toHaveTextContent('Export 2 selected'));
    expect(exportBtn()).toHaveAttribute('data-filter', 'id in ["p1", "p2"]');
  });
});
