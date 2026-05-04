import { describe, it, expect, vi, beforeEach } from 'vitest';
import { findPluginByUrl, handleOpenAndToggle, sendOrInject } from '../../src/background/router';
import { __chromeEvents } from '../setup';

describe('findPluginByUrl', () => {
  it('matches Teams hosts', () => {
    expect(findPluginByUrl('https://teams.cloud.microsoft/foo')).toMatchObject({
      id: 'teams',
    });
    expect(findPluginByUrl('https://teams.microsoft.com/v2/')).toMatchObject({
      id: 'teams',
    });
  });
  it('matches subdomains via suffix', () => {
    expect(findPluginByUrl('https://sub.teams.microsoft.com/foo')).toMatchObject({
      id: 'teams',
    });
  });
  it('returns null for unsupported URLs', () => {
    expect(findPluginByUrl('https://example.com/')).toBeNull();
  });
  it('returns null for invalid URLs / undefined', () => {
    expect(findPluginByUrl(undefined)).toBeNull();
    expect(findPluginByUrl('not-a-url')).toBeNull();
  });
});

describe('sendOrInject', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('uses sendMessage when content script is present', async () => {
    const send = vi.spyOn(chrome.tabs, 'sendMessage').mockResolvedValue(undefined);
    const reload = vi.spyOn(chrome.tabs, 'reload');
    await sendOrInject(42, 'teams');
    expect(send).toHaveBeenCalledWith(42, { type: 'TOGGLE' });
    expect(reload).not.toHaveBeenCalled();
  });

  it('falls back to tab reload when first send fails', async () => {
    let calls = 0;
    vi.spyOn(chrome.tabs, 'sendMessage').mockImplementation(async () => {
      calls++;
      if (calls === 1) throw new Error('no listener');
      return undefined;
    });
    const reload = vi.spyOn(chrome.tabs, 'reload').mockResolvedValue(undefined as never);
    const promise = sendOrInject(42, 'teams');
    // Allow the listener to attach, then fire 'complete'.
    await new Promise((r) => setTimeout(r, 10));
    __chromeEvents.onUpdated.fire(
      42,
      { status: 'complete' } as chrome.tabs.TabChangeInfo,
      { id: 42 } as chrome.tabs.Tab,
    );
    await promise;
    expect(reload).toHaveBeenCalledWith(42);
    expect(calls).toBe(2);
  });
});

describe('handleOpenAndToggle', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('focuses an existing matching tab and sends TOGGLE', async () => {
    const existing = {
      id: 7,
      url: 'https://teams.cloud.microsoft/',
      windowId: 1,
    } as chrome.tabs.Tab;
    vi.spyOn(chrome.tabs, 'query').mockImplementation(async (q) => {
      if (typeof q.url === 'string' && q.url.includes('teams.cloud.microsoft')) {
        return [existing] as never;
      }
      return [] as never;
    });
    const update = vi.spyOn(chrome.tabs, 'update').mockResolvedValue({} as never);
    const send = vi.spyOn(chrome.tabs, 'sendMessage').mockResolvedValue(undefined);
    await handleOpenAndToggle('teams');
    expect(update).toHaveBeenCalledWith(7, { active: true });
    expect(send).toHaveBeenCalledWith(7, { type: 'TOGGLE' });
  });

  it('opens a new tab and waits for matching URL through auth redirect', async () => {
    vi.spyOn(chrome.tabs, 'query').mockResolvedValue([] as never);
    vi.spyOn(chrome.tabs, 'create').mockResolvedValue({
      id: 100,
      url: 'about:blank',
      windowId: 1,
    } as never);
    vi.spyOn(chrome.tabs, 'get').mockResolvedValue({
      id: 100,
      url: 'about:blank',
    } as never);
    const send = vi.spyOn(chrome.tabs, 'sendMessage').mockResolvedValue(undefined);

    const promise = handleOpenAndToggle('teams');

    // Yield until the listener is registered.
    await new Promise((r) => setTimeout(r, 10));
    expect(__chromeEvents.onUpdated.listeners.length).toBeGreaterThan(0);

    // Simulate intermediate auth redirect — should NOT trigger send.
    __chromeEvents.onUpdated.fire(
      100,
      { status: 'complete' } as chrome.tabs.TabChangeInfo,
      { id: 100, url: 'https://login.microsoftonline.com/foo' } as chrome.tabs.Tab,
    );
    expect(send).not.toHaveBeenCalled();

    // Final landing on the matching URL — should resolve and send.
    __chromeEvents.onUpdated.fire(
      100,
      { status: 'complete' } as chrome.tabs.TabChangeInfo,
      { id: 100, url: 'https://teams.cloud.microsoft/main' } as chrome.tabs.Tab,
    );
    await promise;
    expect(send).toHaveBeenCalledWith(100, { type: 'TOGGLE' });
  });

  it('rejects when plugin id is unknown', async () => {
    await expect(handleOpenAndToggle('unknown')).rejects.toThrow(/Unknown plugin/);
  });
});
