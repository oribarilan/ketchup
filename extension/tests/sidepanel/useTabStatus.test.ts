import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useTabStatus } from '../../src/sidepanel/hooks/useTabStatus';
import { __chromeEvents } from '../setup';

describe('useTabStatus', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('hydrates from GET_TAB_STATUSES on mount', async () => {
    vi.spyOn(chrome.runtime, 'sendMessage').mockResolvedValue({
      statuses: [{ pluginId: 'teams', tabId: 1, url: 'https://teams.cloud.microsoft/' }],
    });
    const { result } = renderHook(() => useTabStatus());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.statuses['teams']?.tabId).toBe(1);
  });

  it('debounces a burst of tab events to a single refresh', async () => {
    const send = vi.spyOn(chrome.runtime, 'sendMessage').mockResolvedValue({ statuses: [] });
    renderHook(() => useTabStatus());
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));

    act(() => {
      for (let i = 0; i < 10; i++) {
        __chromeEvents.onUpdated.fire(
          i,
          { status: 'complete' } as chrome.tabs.TabChangeInfo,
          { id: i } as chrome.tabs.Tab,
        );
      }
    });
    await new Promise((r) => setTimeout(r, 350));
    expect(send).toHaveBeenCalledTimes(2);
  });
});
