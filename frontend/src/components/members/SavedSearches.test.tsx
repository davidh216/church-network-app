import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SearchQuery } from '@embrace/shared';
import { render } from '@/test/render';
import type { SavedSearch } from '@/types/domain';
import SavedSearches from './SavedSearches';

const savedApi = vi.hoisted(() => ({
  listSavedSearches: vi.fn(),
  createSavedSearch: vi.fn(),
  deleteSavedSearch: vi.fn(),
  useSavedSearch: vi.fn(),
}));
vi.mock('@/lib/api/savedSearches', () => savedApi);

const stageQuery: SearchQuery = {
  conditions: [{ field: 'engagement.membershipStage', operator: 'equals', value: 'new_member' }],
  logic: 'AND',
};

const valid: SavedSearch = {
  id: 's1',
  name: 'New members',
  description: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  isPublic: false,
  invalid: false,
  query: stageQuery,
};
const stale: SavedSearch = {
  id: 's2',
  name: 'Old format',
  description: 'From before validation',
  createdAt: '2026-01-01T00:00:00.000Z',
  isPublic: true,
  invalid: true,
  query: { conditions: [{ field: 'x', operator: 'greater_than', value: '1' }], type: 'advanced' },
};

async function setup(currentQuery: SearchQuery | null = null) {
  const onLoadSearch = vi.fn();
  await render(
    <SavedSearches onLoadSearch={onLoadSearch} onClose={vi.fn()} currentQuery={currentQuery} />,
  );
  return { onLoadSearch };
}

beforeEach(() => {
  vi.resetAllMocks();
  savedApi.listSavedSearches.mockResolvedValue([valid, stale]);
  savedApi.useSavedSearch.mockResolvedValue(undefined);
});

describe('SavedSearches', () => {
  it('applies a saved search and records the use', async () => {
    const { onLoadSearch } = await setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Apply New members' }));
    expect(onLoadSearch).toHaveBeenCalledWith(stageQuery);
    await waitFor(() => expect(savedApi.useSavedSearch).toHaveBeenCalledWith('s1'));
  });

  it('marks stale rows invalid and does not apply them', async () => {
    const { onLoadSearch } = await setup();
    const row = await screen.findByRole('button', {
      name: 'Old format (invalid, cannot be applied)',
    });
    expect(row).toBeDisabled();
    expect(screen.getByText('Invalid')).toBeInTheDocument();
    fireEvent.click(row);
    expect(onLoadSearch).not.toHaveBeenCalled();
    expect(savedApi.useSavedSearch).not.toHaveBeenCalled();
  });

  it('treats a row whose query does not parse as invalid even if the API missed it', async () => {
    savedApi.listSavedSearches.mockResolvedValue([
      { ...valid, query: { conditions: [], logic: 'AND' } },
    ]);
    await setup();
    expect(
      await screen.findByRole('button', { name: 'New members (invalid, cannot be applied)' }),
    ).toBeDisabled();
  });

  it('applies a predefined quick search', async () => {
    const { onLoadSearch } = await setup();
    fireEvent.click(screen.getByRole('button', { name: /^Leaders and Core Members/ }));
    expect(onLoadSearch).toHaveBeenCalledWith({
      conditions: [
        { field: 'engagement.membershipStage', operator: 'in', value: ['leader', 'core_member'] },
      ],
      logic: 'AND',
    });
  });

  it('saves the current query under a name', async () => {
    savedApi.createSavedSearch.mockResolvedValue({ ...valid, id: 's3' });
    await setup(stageQuery);
    fireEvent.click(screen.getByRole('button', { name: 'Save Current Search' }));
    expect(screen.getByText('Membership stage equals New Member')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search name'), { target: { value: ' Newcomers ' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });
    expect(savedApi.createSavedSearch).toHaveBeenCalledWith({
      name: 'Newcomers',
      description: undefined,
      query: stageQuery,
      isPublic: false,
    });
    await waitFor(() => expect(screen.queryByLabelText('Search name')).not.toBeInTheDocument());
    // The list refetches after the save.
    await waitFor(() => expect(savedApi.listSavedSearches).toHaveBeenCalledTimes(2));
  });

  it('deletes after confirmation and shows API errors', async () => {
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );
    savedApi.deleteSavedSearch.mockRejectedValue(new Error('Search not found'));
    await setup();
    await act(async () => {
      fireEvent.click(
        await screen.findByRole('button', { name: 'Delete saved search Old format' }),
      );
    });
    expect(savedApi.deleteSavedSearch).toHaveBeenCalledWith('s2');
    expect(await screen.findByRole('alert')).toHaveTextContent('Search not found');
    vi.unstubAllGlobals();
  });
});
