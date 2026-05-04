import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import teams from '../../src/plugins/teams';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureHtml = readFileSync(resolve(__dirname, '..', 'fixtures', 'teams-unread.html'), 'utf8');

function loadFixture(): Document {
  const parser = new DOMParser();
  return parser.parseFromString(fixtureHtml, 'text/html');
}

describe('teams plugin', () => {
  it('exposes registry-safe metadata', () => {
    expect(teams.id).toBe('teams');
    expect(teams.matches).toContain('teams.cloud.microsoft');
    expect(teams.iframeUrl).toMatch(/teams\.cloud\.microsoft/);
    expect(teams.headerStripDomains.length).toBeGreaterThan(0);
  });

  it('scrapes only unread, non-group items with valid names', async () => {
    const doc = loadFixture();
    const items = await Promise.resolve(teams.scrapeUnread(doc));
    const names = items.map((i) => i.name);
    expect(names).toEqual(['Alice Anderson', 'Charlie Chen', 'Dana Diaz']);
  });

  it('captures stable ids and resolves them back to the original element', async () => {
    const doc = loadFixture();
    const items = await Promise.resolve(teams.scrapeUnread(doc));
    expect(items[0]?.id).toBe('chat-alpha-001');
    const resolved = items[0]?.resolve(doc);
    expect(resolved).toBeTruthy();
    expect(resolved?.getAttribute('data-tid')).toBe('chat-alpha-001');
  });

  it('returns null from resolve against an empty document', async () => {
    const items = await Promise.resolve(teams.scrapeUnread(loadFixture()));
    const empty = new DOMParser().parseFromString('<html><body></body></html>', 'text/html');
    expect(items[0]?.resolve(empty)).toBeNull();
  });

  it('returns [] when the chat tree is missing', async () => {
    const empty = new DOMParser().parseFromString(
      '<html><body><div>nothing here</div></body></html>',
      'text/html',
    );
    expect(await Promise.resolve(teams.scrapeUnread(empty))).toEqual([]);
  });

  // --- Action surface helpers ---
  //
  // Teams' chat row exposes a "More options" button on hover; clicking it
  // opens a `[role="menu"]` (rendered elsewhere in the DOM) with menu items
  // including "Mark as read" and "Mark as unread". We synthesize this shape
  // per-test so each test owns its menu state.
  function attachMoreOptionsAndMenu(
    doc: Document,
    rowEl: HTMLElement,
  ): {
    moreBtn: HTMLButtonElement;
    revealMenu: (labels: string[]) => HTMLElement;
    menuRoot: HTMLElement;
  } {
    const moreBtn = doc.createElement('button');
    moreBtn.setAttribute('aria-label', 'More options');
    rowEl.appendChild(moreBtn);

    const menuRoot = doc.createElement('div');
    doc.body.appendChild(menuRoot);

    const revealMenu = (labels: string[]) => {
      menuRoot.innerHTML = '';
      const menu = doc.createElement('div');
      menu.setAttribute('role', 'menu');
      for (const label of labels) {
        const mi = doc.createElement('div');
        mi.setAttribute('role', 'menuitem');
        mi.setAttribute('aria-label', label);
        mi.textContent = label;
        menu.appendChild(mi);
      }
      menuRoot.appendChild(menu);
      return menu;
    };

    // Default behavior: clicking "More options" reveals both menu items.
    moreBtn.addEventListener('click', () => {
      revealMenu(['Mark as read', 'Mark as unread']);
    });

    return { moreBtn, revealMenu, menuRoot };
  }

  it('actionLeft opens the row context menu and clicks "Mark as read"', async () => {
    const doc = loadFixture();
    const items = await Promise.resolve(teams.scrapeUnread(doc));
    const first = items[0]!;
    const row = first.resolve(doc)!;
    const surface = attachMoreOptionsAndMenu(doc, row);

    let moreClicked = 0;
    surface.moreBtn.addEventListener('click', () => moreClicked++);

    let readClicked = 0;
    let unreadClicked = 0;
    // Spy on menuitems by delegating from menuRoot (items are created on click).
    surface.menuRoot.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const label = target.closest<HTMLElement>('[role="menuitem"]')?.getAttribute('aria-label');
      if (label === 'Mark as read') readClicked++;
      if (label === 'Mark as unread') unreadClicked++;
    });

    await teams.actionLeft!(doc, first);

    expect(moreClicked).toBe(1);
    expect(readClicked).toBe(1);
    expect(unreadClicked).toBe(0);
  });

  it('actionRight opens the row context menu and clicks "Mark as unread"', async () => {
    const doc = loadFixture();
    const items = await Promise.resolve(teams.scrapeUnread(doc));
    const first = items[0]!;
    const row = first.resolve(doc)!;
    const surface = attachMoreOptionsAndMenu(doc, row);

    let moreClicked = 0;
    surface.moreBtn.addEventListener('click', () => moreClicked++);

    let readClicked = 0;
    let unreadClicked = 0;
    surface.menuRoot.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const label = target.closest<HTMLElement>('[role="menuitem"]')?.getAttribute('aria-label');
      if (label === 'Mark as read') readClicked++;
      if (label === 'Mark as unread') unreadClicked++;
    });

    expect(teams.actionRight).toBeDefined();
    await teams.actionRight!(doc, first);

    expect(moreClicked).toBe(1);
    expect(unreadClicked).toBe(1);
    expect(readClicked).toBe(0);
  });

  it('actionLeft/Right resolve gracefully when the row is gone', async () => {
    const doc = loadFixture();
    const items = await Promise.resolve(teams.scrapeUnread(doc));
    const first = items[0]!;
    first.resolve(doc)!.remove();
    // Should not throw — we want the queue to advance, not crash.
    await expect(teams.actionLeft!(doc, first)).resolves.toBeUndefined();
    await expect(teams.actionRight!(doc, first)).resolves.toBeUndefined();
  });
});
