import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useTriageQueue } from '../../src/core/hooks/useTriageQueue';
import type { Plugin, UnreadItem } from '../../src/plugins/types';

function makeItem(id: string): UnreadItem {
  return {
    id,
    name: id,
    resolve: () => null,
  };
}

function makePlugin(overrides: Partial<Plugin> = {}): Plugin {
  return {
    id: 'fake',
    label: 'Fake',
    iconPath: 'icons/fake.svg',
    theme: { accent: '#000' },
    matches: ['fake.test'],
    iframeUrl: 'https://fake.test/',
    headerStripDomains: ['fake.test'],
    waitForReady: async () => {},
    scrapeUnread: () => [makeItem('a'), makeItem('b')],
    openItem: async () => {},
    ...overrides,
  };
}

describe('useTriageQueue', () => {
  it('exposes `opening: true` while plugin.openItem is in flight, then false', async () => {
    let releaseOpen!: () => void;
    const openItem = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releaseOpen = resolve;
        }),
    );
    const plugin = makePlugin({ openItem });
    const doc = new DOMParser().parseFromString('<html><body/></html>', 'text/html');

    const { result } = renderHook(() =>
      useTriageQueue({ plugin, contentDocument: doc, iframeReady: true }),
    );

    // Wait until the queue has reached 'ready' AND openItem has been invoked.
    await waitFor(() => {
      expect(openItem).toHaveBeenCalledTimes(1);
      expect(result.current.state).toBe('ready');
    });
    // While openItem promise is pending, opening should be true.
    expect(result.current.opening).toBe(true);

    // Resolve openItem. The hook should flip opening back to false.
    await act(async () => {
      releaseOpen();
      // let the awaiter run
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(result.current.opening).toBe(false);
    });
  });

  it('flips `opening` true while advancing to the next item, false when openItem resolves', async () => {
    const pending: Array<() => void> = [];
    const openItem = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          pending.push(resolve);
        }),
    );
    const plugin = makePlugin({ openItem });
    const doc = new DOMParser().parseFromString('<html><body/></html>', 'text/html');

    const { result } = renderHook(() =>
      useTriageQueue({ plugin, contentDocument: doc, iframeReady: true }),
    );

    // Wait for first openItem call (initial item) and resolve it so we land on
    // a steady ready state with opening=false.
    await waitFor(() => expect(openItem).toHaveBeenCalledTimes(1));
    await act(async () => {
      pending.shift()!();
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.opening).toBe(false));

    // Advance — opening should become true, then false once we resolve.
    void act(() => {
      void result.current.advance();
    });
    await waitFor(() => expect(openItem).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.opening).toBe(true));

    await act(async () => {
      pending.shift()!();
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.opening).toBe(false));
  });
});
