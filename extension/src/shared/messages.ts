/**
 * Typed runtime message bus.
 *
 * All `chrome.runtime.sendMessage` / `chrome.tabs.sendMessage` traffic flows
 * through `sendMessage` / `sendTabMessage` and is dispatched on the receiver
 * side via `onMessage`. The discriminated `Message` union is the single source
 * of truth for the cross-context wire format.
 */

export interface TabStatus {
  pluginId: string;
  /** Tab id of an existing matching tab, if any. */
  tabId: number | null;
  /** Last-seen URL for that tab. */
  url: string | null;
  /** Reserved for a future story — unread count exposed by the active content script. */
  unreadCount?: number;
}

export type Message =
  | { type: 'TOGGLE' }
  | { type: 'OPEN_AND_TOGGLE'; pluginId: string }
  | { type: 'GET_TAB_STATUSES' }
  | { type: 'TAB_STATUSES'; statuses: TabStatus[] };

export type MessageOf<T extends Message['type']> = Extract<Message, { type: T }>;

function isMessage(value: unknown): value is Message {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string'
  );
}

/** Send a message to the background SW (or other extension contexts). */
export async function sendMessage<T extends Message['type'], R = unknown>(
  msg: MessageOf<T>,
): Promise<R> {
  return (await chrome.runtime.sendMessage(msg)) as R;
}

/** Send a message to a specific tab's content script. */
export async function sendTabMessage<T extends Message['type'], R = unknown>(
  tabId: number,
  msg: MessageOf<T>,
): Promise<R> {
  return (await chrome.tabs.sendMessage(tabId, msg)) as R;
}

export type MessageHandler = (
  msg: Message,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void,
) => boolean | void | Promise<unknown>;

/**
 * Register a typed `onMessage` listener. Returns the unsubscribe function.
 * Invalid (non-Message) payloads are dropped silently.
 */
export function onMessage(handler: MessageHandler): () => void {
  const listener: Parameters<typeof chrome.runtime.onMessage.addListener>[0] = (
    msg,
    sender,
    sendResponse,
  ) => {
    if (!isMessage(msg)) return false;
    const result = handler(msg, sender, sendResponse);
    return typeof result === 'boolean' ? result : false;
  };
  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}
