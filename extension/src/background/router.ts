/**
 * Background router.
 *
 * Owns:
 *  - URL → plugin lookup (`findPluginByUrl`)
 *  - Toolbar action dispatch (`handleActionClick`)
 *  - Sidepanel "open & toggle" flow (`handleOpenAndToggle`) with auth-redirect
 *    settling
 *  - Tab status query for the launcher (`handleGetTabStatuses`)
 *  - Message-or-inject fallback (`sendOrInject`)
 */
import type { PluginMetadata } from '../plugins/types';
import { PLUGIN_METADATA } from '../plugins/registry';
import { sendTabMessage, type TabStatus } from '../shared/messages';

const OPEN_AND_TOGGLE_TIMEOUT_MS = 30_000;

export function findPluginByUrl(
  url: string | undefined,
  metadata: readonly PluginMetadata[] = PLUGIN_METADATA,
): PluginMetadata | null {
  if (!url) return null;
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  for (const meta of metadata) {
    for (const matchHost of meta.matches) {
      if (host === matchHost || host.endsWith('.' + matchHost)) return meta;
    }
  }
  return null;
}

export function entryFileFor(pluginId: string): string {
  return `src/entries/${pluginId}.content.ts`;
}

export async function sendOrInject(tabId: number, _pluginId: string): Promise<void> {
  try {
    await sendTabMessage<'TOGGLE'>(tabId, { type: 'TOGGLE' });
    return;
  } catch {
    // Content script not present (tab pre-dates extension load, or the plugin
    // was just added to the registry). Reload the tab — manifest's auto-injection
    // will register the content script on the fresh page load.
  }
  await chrome.tabs.reload(tabId);
  await waitForTabComplete(tabId);
  // Brief settle window for the content script's onMessage listener to attach.
  await new Promise((r) => setTimeout(r, 800));
  try {
    await sendTabMessage<'TOGGLE'>(tabId, { type: 'TOGGLE' });
  } catch (e) {
    console.error('ketchup: failed to activate after reload', e);
  }
}

function waitForTabComplete(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('Tab reload timeout'));
    }, 30_000);
    const listener = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

export async function handleActionClick(tab: chrome.tabs.Tab): Promise<void> {
  if (!tab.id) return;
  const meta = findPluginByUrl(tab.url);
  if (meta) {
    await sendOrInject(tab.id, meta.id);
    return;
  }
  try {
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch (e) {
    console.error('ketchup: failed to open side panel', e);
  }
}

/**
 * Wait for a tab to reach a URL matching the plugin's host suffixes.
 * Tolerates intermediate auth redirects (e.g. login.microsoftonline.com).
 */
function waitForMatchingUrl(tabId: number, meta: PluginMetadata): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error(`Timeout waiting for ${meta.id} tab`));
    }, OPEN_AND_TOGGLE_TIMEOUT_MS);

    const listener = (
      updatedTabId: number,
      changeInfo: chrome.tabs.TabChangeInfo,
      tab: chrome.tabs.Tab,
    ) => {
      if (updatedTabId !== tabId) return;
      if (changeInfo.status !== 'complete') return;
      const matched = findPluginByUrl(tab.url, [meta]);
      if (matched?.id === meta.id) {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);

    // If the tab already matches at call time, resolve immediately.
    chrome.tabs.get(tabId).then(
      (tab) => {
        if (tab && findPluginByUrl(tab.url, [meta])) {
          clearTimeout(timer);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      },
      () => {
        /* ignore */
      },
    );
  });
}

export async function handleOpenAndToggle(pluginId: string): Promise<void> {
  const meta = PLUGIN_METADATA.find((m) => m.id === pluginId);
  if (!meta) throw new Error(`Unknown plugin: ${pluginId}`);

  // Look for an existing matching tab.
  const existing = await findExistingTabFor(meta);
  if (existing && existing.id != null) {
    await chrome.tabs.update(existing.id, { active: true });
    if (existing.windowId != null) {
      await chrome.windows.update(existing.windowId, { focused: true });
    }
    await sendOrInject(existing.id, meta.id);
    return;
  }

  // Otherwise open a new tab to iframeUrl.
  const created = await chrome.tabs.create({ url: meta.iframeUrl, active: true });
  if (!created.id) throw new Error('Failed to open tab');
  await waitForMatchingUrl(created.id, meta);
  await sendOrInject(created.id, meta.id);
}

async function findExistingTabFor(meta: PluginMetadata): Promise<chrome.tabs.Tab | null> {
  const queries = await Promise.all(
    meta.matches.map((host) => chrome.tabs.query({ url: `https://${host}/*` })),
  );
  const flat = queries.flat();
  return flat[0] ?? null;
}

export async function handleGetTabStatuses(): Promise<TabStatus[]> {
  const result: TabStatus[] = [];
  for (const meta of PLUGIN_METADATA) {
    const tab = await findExistingTabFor(meta);
    result.push({
      pluginId: meta.id,
      tabId: tab?.id ?? null,
      url: tab?.url ?? null,
    });
  }
  return result;
}
