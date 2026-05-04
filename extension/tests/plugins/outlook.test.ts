import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import outlook from '../../src/plugins/outlook';
import { ItemDetachedError } from '../../src/plugins/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureHtml = readFileSync(
  resolve(__dirname, '..', 'fixtures', 'outlook-unread.html'),
  'utf8',
);

function loadFixture(): Document {
  return new DOMParser().parseFromString(fixtureHtml, 'text/html');
}

describe('outlook plugin', () => {
  it('exposes registry-safe metadata', () => {
    expect(outlook.id).toBe('outlook');
    expect(outlook.matches).toContain('outlook.cloud.microsoft');
    expect(outlook.iframeUrl).toMatch(/outlook\./);
    expect(outlook.headerStripDomains).toContain('outlook.cloud.microsoft');
  });

  it('scrapes only rows with aria-label starting with "Unread"', async () => {
    const items = await Promise.resolve(outlook.scrapeUnread(loadFixture()));
    expect(items).toHaveLength(3);
    expect(items[0]?.name).toMatch(/Yair Tsarfaty/);
  });

  it('strips noise prefixes (Meeting, Marked as ... by Copilot, Collapsed) from name', async () => {
    const items = await Promise.resolve(outlook.scrapeUnread(loadFixture()));
    // Sample 3: "Unread Collapsed Marked as high priority by Copilot Inbar Rotem; AskHR Support Transfer Completed - Ori Bar-ilan 9:31 ..."
    const inbar = items.find((i) => i.name.includes('Inbar Rotem'));
    expect(inbar?.name).not.toMatch(/Collapsed/);
    expect(inbar?.name).not.toMatch(/Marked as/);
    expect(inbar?.name).not.toMatch(/Copilot/);
    expect(inbar?.name).toMatch(/Transfer Completed/);
    // Time should not appear
    expect(inbar?.name).not.toMatch(/9:31/);
  });

  it('uses data-convid as the stable id when available', async () => {
    const items = await Promise.resolve(outlook.scrapeUnread(loadFixture()));
    expect(items[0]?.id).toBe('conv-aaa-001-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  });

  it('resolve round-trips against the same doc', async () => {
    const doc = loadFixture();
    const items = await Promise.resolve(outlook.scrapeUnread(doc));
    const first = items[0]!;
    const el = first.resolve(doc);
    expect(el).not.toBeNull();
    expect(el?.getAttribute('aria-label')).toMatch(/Unread/);
  });

  it('resolve returns null against an empty doc', async () => {
    const items = await Promise.resolve(outlook.scrapeUnread(loadFixture()));
    const empty = new DOMParser().parseFromString('<html><body/></html>', 'text/html');
    expect(items[0]?.resolve(empty)).toBeNull();
  });

  it('returns [] when no unread rows exist', async () => {
    const empty = new DOMParser().parseFromString(
      '<html><body><div>nothing</div></body></html>',
      'text/html',
    );
    expect(await Promise.resolve(outlook.scrapeUnread(empty))).toEqual([]);
  });

  // Helpers for action-surface tests. The live Outlook DOM exposes command-bar
  // buttons (Archive, Mark as unread) that act on the currently-selected row.
  // We synthesize them per-test and verify the plugin clicks them after
  // selecting the row.
  function attachToolbar(doc: Document): {
    archiveBtn: HTMLButtonElement;
    unreadBtn: HTMLButtonElement;
  } {
    const toolbar = doc.createElement('div');
    toolbar.setAttribute('role', 'toolbar');
    const archiveBtn = doc.createElement('button');
    archiveBtn.setAttribute('aria-label', 'Archive');
    const unreadBtn = doc.createElement('button');
    unreadBtn.setAttribute('aria-label', 'Mark as unread');
    toolbar.appendChild(archiveBtn);
    toolbar.appendChild(unreadBtn);
    doc.body.appendChild(toolbar);
    // happy-dom returns null for offsetParent on detached elements; force a
    // truthy value so `offsetParent !== null` visibility checks pass.
    for (const b of [archiveBtn, unreadBtn]) {
      Object.defineProperty(b, 'offsetParent', { configurable: true, get: () => doc.body });
    }
    return { archiveBtn, unreadBtn };
  }

  it('per-item actionLeftFn (email) selects the row then clicks the Archive toolbar button', async () => {
    const doc = loadFixture();
    const items = await Promise.resolve(outlook.scrapeUnread(doc));
    const email = items.find((i) => i.kind !== 'meeting')!;
    const { archiveBtn, unreadBtn } = attachToolbar(doc);

    let rowClicked = 0;
    let archiveClicked = 0;
    let unreadClicked = 0;
    email.resolve(doc)!.addEventListener('click', () => rowClicked++);
    archiveBtn.addEventListener('click', () => archiveClicked++);
    unreadBtn.addEventListener('click', () => unreadClicked++);

    await email.actionLeftFn!(doc);

    expect(rowClicked).toBeGreaterThanOrEqual(1);
    expect(archiveClicked).toBe(1);
    expect(unreadClicked).toBe(0);
  });

  it('per-item actionRightFn (email) selects the row then clicks the Mark-as-unread toolbar button', async () => {
    const doc = loadFixture();
    const items = await Promise.resolve(outlook.scrapeUnread(doc));
    const email = items.find((i) => i.kind !== 'meeting')!;
    const { archiveBtn, unreadBtn } = attachToolbar(doc);

    let rowClicked = 0;
    let archiveClicked = 0;
    let unreadClicked = 0;
    email.resolve(doc)!.addEventListener('click', () => rowClicked++);
    archiveBtn.addEventListener('click', () => archiveClicked++);
    unreadBtn.addEventListener('click', () => unreadClicked++);

    expect(email.actionRightFn).toBeDefined();
    await email.actionRightFn!(doc);

    expect(rowClicked).toBeGreaterThanOrEqual(1);
    expect(unreadClicked).toBe(1);
    expect(archiveClicked).toBe(0);
  });

  it('actionLeftFn falls back to a keyboard shortcut when no Archive button is visible', async () => {
    const doc = loadFixture();
    const items = await Promise.resolve(outlook.scrapeUnread(doc));
    const email = items.find((i) => i.kind !== 'meeting')!;
    // No toolbar attached. Plugin should fall back to dispatching a keydown
    // somewhere in the doc tree (capture-phase listener catches any target).
    let archiveKey = 0;
    doc.addEventListener(
      'keydown',
      (e) => {
        if ((e as KeyboardEvent).key.toLowerCase() === 'e') archiveKey++;
      },
      true,
    );

    await email.actionLeftFn!(doc);
    expect(archiveKey).toBeGreaterThanOrEqual(1);
  });

  it('actionLeftFn (email) throws ItemDetachedError when row cannot be resolved', async () => {
    const doc = loadFixture();
    const items = await Promise.resolve(outlook.scrapeUnread(doc));
    const email = items.find((i) => i.kind !== 'meeting');
    expect(email).toBeDefined();
    email!.resolve(doc)!.remove();
    await expect(email!.actionLeftFn!(doc)).rejects.toBeInstanceOf(ItemDetachedError);
  });

  it('actionLeftFn waits for a delayed Archive toolbar button before failing back to keyboard', async () => {
    const doc = loadFixture();
    const items = await Promise.resolve(outlook.scrapeUnread(doc));
    const email = items.find((i) => i.kind !== 'meeting')!;

    let archiveClicked = 0;
    let archiveKey = 0;

    // Toolbar appears asynchronously, ~250ms after the row is clicked.
    email.resolve(doc)!.addEventListener('click', () => {
      setTimeout(() => {
        const toolbar = doc.createElement('div');
        toolbar.setAttribute('role', 'toolbar');
        const btn = doc.createElement('button');
        btn.setAttribute('aria-label', 'Archive');
        Object.defineProperty(btn, 'offsetParent', { configurable: true, get: () => doc.body });
        btn.addEventListener('click', () => archiveClicked++);
        toolbar.appendChild(btn);
        doc.body.appendChild(toolbar);
      }, 250);
    });

    doc.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key.toLowerCase() === 'e') archiveKey++;
    });

    await email.actionLeftFn!(doc);
    expect(archiveClicked).toBe(1);
    // Did NOT fall back to keyboard since the button appeared in time.
    expect(archiveKey).toBe(0);
  });

  it('actionLeftFn does not re-click an already-selected row (avoid Outlook deselect toggle)', async () => {
    const doc = loadFixture();
    const items = await Promise.resolve(outlook.scrapeUnread(doc));
    const email = items.find((i) => i.kind !== 'meeting')!;
    const row = email.resolve(doc)!;
    // Mark the row as already selected (e.g. openItem just clicked it).
    row.setAttribute('aria-selected', 'true');

    const { archiveBtn } = attachToolbar(doc);

    let rowClicked = 0;
    let archiveClicked = 0;
    row.addEventListener('click', () => rowClicked++);
    archiveBtn.addEventListener('click', () => archiveClicked++);

    await email.actionLeftFn!(doc);

    expect(rowClicked).toBe(0); // Did not toggle selection.
    expect(archiveClicked).toBe(1);
  });

  it('actionRightFn (email) throws ItemDetachedError when row cannot be resolved', async () => {
    const doc = loadFixture();
    const items = await Promise.resolve(outlook.scrapeUnread(doc));
    const email = items.find((i) => i.kind !== 'meeting');
    email!.resolve(doc)!.remove();
    await expect(email!.actionRightFn!(doc)).rejects.toBeInstanceOf(ItemDetachedError);
  });

  // Regression: the second archive in a row was hitting the toolbar's Archive
  // button before Outlook had propagated the new selection — so it archived
  // the *previous* (auto-selected) message instead of our row. The action
  // must wait until our row is `aria-selected="true"` before clicking Archive.
  it('actionLeftFn does not click Archive until our row is aria-selected (stale-toolbar guard)', async () => {
    const doc = loadFixture();
    const items = await Promise.resolve(outlook.scrapeUnread(doc));
    const email = items.find((i) => i.kind !== 'meeting')!;
    const row = email.resolve(doc)!;

    // Pre-existing (stale) Archive button — represents the post-first-archive
    // state where Outlook left the toolbar bound to the auto-selected message.
    const { archiveBtn } = attachToolbar(doc);

    let archiveClicked = 0;
    let archivedWhileSelected = false;
    archiveBtn.addEventListener('click', () => {
      archiveClicked++;
      archivedWhileSelected = row.getAttribute('aria-selected') === 'true';
    });

    // Outlook flips aria-selected ~250ms after our row click — modelling
    // the SPA's async selection update.
    row.addEventListener('click', () => {
      setTimeout(() => row.setAttribute('aria-selected', 'true'), 250);
    });

    await email.actionLeftFn!(doc);

    expect(archiveClicked).toBe(1);
    expect(archivedWhileSelected).toBe(true);
  });

  it('openItem waits for the clicked row to become aria-selected before resolving', async () => {
    const doc = loadFixture();
    const items = await Promise.resolve(outlook.scrapeUnread(doc));
    const email = items.find((i) => i.kind !== 'meeting')!;
    const row = email.resolve(doc)!;

    row.addEventListener('click', () => {
      setTimeout(() => row.setAttribute('aria-selected', 'true'), 200);
    });

    const t0 = Date.now();
    await outlook.openItem!(doc, email);
    const elapsed = Date.now() - t0;
    expect(row.getAttribute('aria-selected')).toBe('true');
    // Should have waited at least the ~200ms it took for selection to flip.
    expect(elapsed).toBeGreaterThanOrEqual(180);
  });

  it('waitForReady resolves when an Unread row exists', async () => {
    await expect(outlook.waitForReady(loadFixture())).resolves.toBeUndefined();
  });

  it('waitForReady falls through within budget when DOM never appears', async () => {
    const empty = new DOMParser().parseFromString('<html><body/></html>', 'text/html');
    vi.useFakeTimers();
    const promise = outlook.waitForReady(empty);
    await vi.advanceTimersByTimeAsync(15_500);
    await expect(promise).resolves.toBeUndefined();
    vi.useRealTimers();
  });

  // Regression: after `scrapeUnread` scrolls through the virtualized list, the
  // first item's row is no longer in the DOM. `openItem` must consult the
  // per-row scroll snap and scroll the row back into view before clicking,
  // not just call `resolve` and bail. (Symptom of the bug: card iframe shows
  // the inbox list and never zooms into a specific email.)
  it('openItem scrolls back to the saved snap position when the row was virtualized out', async () => {
    // Synthetic doc with a real `.customScrollBar` scroller so `findScroller`
    // returns it and `scrapeUnread` exercises the scroll-collect path.
    const doc = new DOMParser().parseFromString(
      `<html><body>
         <div class="customScrollBar">
           <div role="option" aria-label="Unread Foo Bar 9:00" data-convid="row-foo"></div>
           <div role="option" aria-label="Unread Baz Qux 9:01" data-convid="row-baz"></div>
         </div>
       </body></html>`,
      'text/html',
    );
    const scroller = doc.querySelector<HTMLElement>('.customScrollBar')!;
    // Make `findScroller` accept this as a real scroller.
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 4000 });
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 600 });
    let _top = 0;
    const maxTop = 4000 - 600;
    Object.defineProperty(scroller, 'scrollTop', {
      configurable: true,
      get: () => _top,
      // Clamp like a real scroller — keeps `scrapeUnread`'s loop terminating.
      set: (v: number) => {
        _top = Math.max(0, Math.min(v, maxTop));
      },
    });

    const items = await Promise.resolve(outlook.scrapeUnread(doc));
    expect(items.length).toBeGreaterThan(0);
    const first = items[0]!;

    // Simulate Outlook virtualizing the row away after scrape, AND the
    // scroller having drifted to the bottom (this is the production state
    // — `scrapeUnread` ends with scrollTop near scrollHeight).
    const row = first.resolve(doc)!;
    const parent = row.parentElement!;
    row.remove();
    _top = maxTop;

    // Re-attach the row when openItem scrolls back near the snap (which was
    // taken at scrollTop=0). This is what real virtualization does.
    Object.defineProperty(scroller, 'scrollTop', {
      configurable: true,
      get: () => _top,
      set: (v: number) => {
        _top = Math.max(0, Math.min(v, maxTop));
        if (_top < 100 && !parent.contains(row)) parent.appendChild(row);
      },
    });

    let clicked = false;
    row.addEventListener('click', () => {
      clicked = true;
      // Mirror real Outlook: clicking the row flips it to aria-selected so
      // openItem's selection-convergence wait can resolve.
      row.setAttribute('aria-selected', 'true');
    });

    await expect(outlook.openItem!(doc, first)).resolves.toBeUndefined();
    expect(clicked).toBe(true);
    expect(_top).toBeLessThan(100); // openItem scrolled back to the snap.
  });
});
