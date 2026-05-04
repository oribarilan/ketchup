/**
 * Service worker entry. Wires `chrome.action.onClicked` and the typed
 * message bus to `router` handlers.
 */
import { onMessage } from '../shared/messages';
import { handleActionClick, handleGetTabStatuses, handleOpenAndToggle } from './router';

chrome.action.onClicked.addListener((tab) => {
  void handleActionClick(tab);
});

onMessage((msg, _sender, sendResponse) => {
  if (msg.type === 'OPEN_AND_TOGGLE') {
    handleOpenAndToggle(msg.pluginId).then(
      () => sendResponse({ ok: true }),
      (e: unknown) => sendResponse({ ok: false, error: String(e) }),
    );
    return true; // async
  }
  if (msg.type === 'GET_TAB_STATUSES') {
    handleGetTabStatuses().then((statuses) => sendResponse({ type: 'TAB_STATUSES', statuses }));
    return true;
  }
  return false;
});
