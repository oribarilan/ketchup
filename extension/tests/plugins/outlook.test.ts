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
});
