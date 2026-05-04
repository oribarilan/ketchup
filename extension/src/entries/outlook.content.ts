/**
 * Outlook content-script entry. Toggles the React overlay in response to
 * `TOGGLE` messages from the background service worker.
 */
import { startTriage, type TriageHandle } from '../core';
import outlook from '../plugins/outlook';
import { onMessage } from '../shared/messages';

let handle: TriageHandle | null = null;

onMessage((msg) => {
  if (msg.type !== 'TOGGLE') return;
  if (handle) {
    handle.teardown();
    handle = null;
  } else {
    handle = startTriage(outlook);
  }
});
