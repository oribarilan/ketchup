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

  it('per-item actionLeftFn on a non-meeting email clicks the row then dispatches keydown "e"', async () => {
    const doc = loadFixture();
    const items = await Promise.resolve(outlook.scrapeUnread(doc));
    // Pick the first non-meeting item (Charlie Chen / PR review).
    const email = items.find((i) => i.kind !== 'meeting');
    expect(email).toBeDefined();
    let clicked = false;
    let eKey = false;
    email!.resolve(doc)!.addEventListener('click', () => (clicked = true));
    doc.addEventListener('keydown', (e) => {
      if (e.key === 'e') eKey = true;
    });
    await email!.actionLeftFn!(doc);
    expect(clicked).toBe(true);
    expect(eKey).toBe(true);
  });

  it('per-item actionLeftFn throws ItemDetachedError when row cannot be resolved', async () => {
    const doc = loadFixture();
    const items = await Promise.resolve(outlook.scrapeUnread(doc));
    const email = items.find((i) => i.kind !== 'meeting');
    expect(email).toBeDefined();
    // Make the item un-resolvable by stripping the row from the doc.
    email!.resolve(doc)!.remove();
    await expect(email!.actionLeftFn!(doc)).rejects.toBeInstanceOf(ItemDetachedError);
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
    row.addEventListener('click', () => (clicked = true));

    await expect(outlook.openItem!(doc, first)).resolves.toBeUndefined();
    expect(clicked).toBe(true);
    expect(_top).toBeLessThan(100); // openItem scrolled back to the snap.
  });
});
