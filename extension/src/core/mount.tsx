import { createRoot, type Root } from 'react-dom/client';
import { StrictMode } from 'react';
import type { Plugin } from '../plugins/types';
import { Overlay } from './components/Overlay';
import overlayCss from './styles/overlay.css?raw';

export interface TriageHandle {
  teardown(): void;
}

const HOST_ID = 'ketchup-host';

/**
 * Mounts the React overlay into a shadow root attached to the page's body.
 *
 * If the host SPA tears down `<div id="ketchup-host">` (workspace switch, list
 * virtualization), a MutationObserver re-mounts it.
 */
export function mountOverlay(plugin: Plugin): TriageHandle {
  let host: HTMLElement | null = null;
  let root: Root | null = null;
  let observer: MutationObserver | null = null;
  let tornDown = false;

  function mount() {
    if (tornDown) return;
    if (document.getElementById(HOST_ID)) return;

    host = document.createElement('div');
    host.id = HOST_ID;
    host.style.cssText = 'position:fixed;inset:0;z-index:999999;';
    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = overlayCss;
    shadow.appendChild(style);
    const reactHost = document.createElement('div');
    shadow.appendChild(reactHost);

    root = createRoot(reactHost);
    root.render(
      <StrictMode>
        <Overlay plugin={plugin} onTeardown={teardown} />
      </StrictMode>,
    );
  }

  function teardown() {
    tornDown = true;
    observer?.disconnect();
    observer = null;
    try {
      root?.unmount();
    } catch {
      /* ignore */
    }
    root = null;
    host?.remove();
    host = null;
  }

  mount();

  // Re-mount if the host SPA removes our host element.
  observer = new MutationObserver(() => {
    if (tornDown) return;
    if (host && !document.body.contains(host)) {
      // Element was removed by the host page — re-mount.
      try {
        root?.unmount();
      } catch {
        /* ignore */
      }
      root = null;
      host = null;
      mount();
    }
  });
  observer.observe(document.body, { childList: true });

  return { teardown };
}
