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

  it('actionLeft is a no-op (Teams marks chats read on view)', async () => {
    const doc = loadFixture();
    const items = await Promise.resolve(teams.scrapeUnread(doc));
    const first = items[0]!;
    const el = first.resolve(doc)!;
    let clicked = 0;
    el.addEventListener('click', () => clicked++);
    await teams.actionLeft!(doc, first);
    expect(clicked).toBe(0);
  });
});
