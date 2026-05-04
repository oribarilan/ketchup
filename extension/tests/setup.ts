import '@testing-library/jest-dom/vitest';

// Provide a minimal `chrome` API mock so sidepanel hooks and background
// router tests can spy on calls. Tests can override individual methods via
// `vi.spyOn(chrome.tabs, 'query', …)` etc.

type Listener<T extends unknown[]> = (...args: T) => void;

function createEvent<T extends unknown[]>() {
  const listeners: Listener<T>[] = [];
  return {
    addListener: (l: Listener<T>) => listeners.push(l),
    removeListener: (l: Listener<T>) => {
      const i = listeners.indexOf(l);
      if (i >= 0) listeners.splice(i, 1);
    },
    hasListener: (l: Listener<T>) => listeners.includes(l),
    fire: (...args: T) => listeners.slice().forEach((l) => l(...args)),
    listeners,
  };
}

const onUpdated = createEvent<[number, chrome.tabs.TabChangeInfo, chrome.tabs.Tab]>();
const onRemoved = createEvent<[number, chrome.tabs.TabRemoveInfo]>();
const onCreated = createEvent<[chrome.tabs.Tab]>();

export const __chromeEvents = { onUpdated, onRemoved, onCreated };

const chromeMock = {
  runtime: {
    sendMessage: async (_msg: unknown) => ({ statuses: [] }),
    onMessage: {
      addListener: () => {},
      removeListener: () => {},
    },
    getURL: (path: string) => `chrome-extension://test/${path}`,
  },
  tabs: {
    sendMessage: async (_id: number, _msg: unknown) => undefined,
    query: async (_q: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]> => [],
    create: async (props: chrome.tabs.CreateProperties): Promise<chrome.tabs.Tab> =>
      ({ id: 999, url: props.url, windowId: 1 }) as chrome.tabs.Tab,
    update: async (_id: number, _props: chrome.tabs.UpdateProperties) => ({}),
    reload: async (_id: number) => undefined,
    get: async (_id: number): Promise<chrome.tabs.Tab> => ({ id: _id, url: '' }) as chrome.tabs.Tab,
    onUpdated,
    onRemoved,
    onCreated,
  },
  windows: {
    update: async (_id: number, _props: chrome.windows.UpdateInfo) => ({}),
  },
  scripting: {
    executeScript: async (_args: chrome.scripting.ScriptInjection<unknown[], unknown>) => [],
  },
  action: {
    onClicked: createEvent<[chrome.tabs.Tab]>(),
  },
  sidePanel: {
    open: async (_opts: { tabId?: number }) => undefined,
  },
};

(globalThis as unknown as { chrome: unknown }).chrome = chromeMock;
