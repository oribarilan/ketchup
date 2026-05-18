#!/usr/bin/env node
/**
 * Reloads the ketchup extension via Chrome DevTools Protocol.
 * Works with Chrome, Edge, or any Chromium browser.
 * Requires the browser running with --remote-debugging-port=9222.
 * One-time setup: quit the browser, then start it with `just edge` (or `just chrome`).
 */

const CDP_PORT = process.env.CDP_PORT ?? '9222';
const CDP_BASE = `http://localhost:${CDP_PORT}`;

async function findExtensionWorker() {
  let res;
  try {
    res = await fetch(`${CDP_BASE}/json`);
  } catch {
    console.error(
      `Cannot reach CDP on port ${CDP_PORT}.\n` +
        'Quit the browser and restart with:  just edge  (or just chrome)',
    );
    process.exit(1);
  }

  const targets = await res.json();
  const sw = targets.find(
    (t) =>
      t.type === 'service_worker' &&
        (t.url.startsWith('chrome-extension://') ||
          t.url.startsWith('extension://')),
  );
  if (!sw) {
    console.error(
      'No extension service worker found.\n' +
        'Load the unpacked extension from extension/dist/ first.',
    );
    process.exit(1);
  }
  return sw;
}

async function reload() {
  const target = await findExtensionWorker();
  const ws = new WebSocket(target.webSocketDebuggerUrl);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('Reload timed out after 5 s'));
    }, 5000);

    ws.addEventListener('open', () => {
      ws.send(
        JSON.stringify({
          id: 1,
          method: 'Runtime.evaluate',
          params: { expression: 'chrome.runtime.reload()' },
        }),
      );
    });

    ws.addEventListener('message', (event) => {
      const data = JSON.parse(event.data);
      if (data.id === 1) {
        clearTimeout(timeout);
        ws.close();
        if (data.result?.exceptionDetails) {
          reject(new Error('chrome.runtime.reload() threw — check the extension'));
        } else {
          console.log('Extension reloaded');
          resolve();
        }
      }
    });

    ws.addEventListener('error', () => {
      clearTimeout(timeout);
      reject(new Error('WebSocket connection failed'));
    });
  });
}

try {
  await reload();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
