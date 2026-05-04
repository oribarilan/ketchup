import { useEffect, useRef, useState } from 'react';
import { sendMessage, type TabStatus } from '../../shared/messages';

const DEBOUNCE_MS = 250;

export type StatusMap = Record<string, TabStatus>;

/**
 * Live `Record<pluginId, TabStatus>` of which apps currently have an open tab.
 * Subscribes to chrome.tabs events and debounces refetches.
 */
export function useTabStatus(): { statuses: StatusMap; loading: boolean } {
  const [statuses, setStatuses] = useState<StatusMap>({});
  const [loading, setLoading] = useState(true);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const res = await sendMessage<'GET_TAB_STATUSES', { statuses: TabStatus[] }>({
          type: 'GET_TAB_STATUSES',
        });
        if (cancelled) return;
        const map: StatusMap = {};
        for (const s of res.statuses) map[s.pluginId] = s;
        setStatuses(map);
        setLoading(false);
      } catch (e) {
        console.error('fs: useTabStatus refresh failed', e);
        if (!cancelled) setLoading(false);
      }
    }

    function scheduleRefresh() {
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(() => void refresh(), DEBOUNCE_MS);
    }

    void refresh();

    const onUpdated = (_tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      // Only react to terminal events to avoid render storms during page loads.
      if (changeInfo.status !== 'complete' && changeInfo.url == null) return;
      scheduleRefresh();
    };
    const onChanged = () => scheduleRefresh();

    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onChanged);
    chrome.tabs.onCreated.addListener(onChanged);

    return () => {
      cancelled = true;
      if (debounce.current) clearTimeout(debounce.current);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onChanged);
      chrome.tabs.onCreated.removeListener(onChanged);
    };
  }, []);

  return { statuses, loading };
}
