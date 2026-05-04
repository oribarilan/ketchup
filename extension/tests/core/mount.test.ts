import { describe, it, expect } from 'vitest';
import { mountOverlay } from '../../src/core/mount';
import teams from '../../src/plugins/teams';

describe('mountOverlay', () => {
  it('creates host element with shadow root and removes on teardown', () => {
    const handle = mountOverlay(teams);
    const host = document.getElementById('ketchup-host');
    expect(host).not.toBeNull();
    expect(host?.shadowRoot).not.toBeNull();
    handle.teardown();
    expect(document.getElementById('ketchup-host')).toBeNull();
  });

  it('teardown is idempotent', () => {
    const handle = mountOverlay(teams);
    handle.teardown();
    expect(() => handle.teardown()).not.toThrow();
  });

  it('does not leak listeners on body after teardown', () => {
    const handle = mountOverlay(teams);
    handle.teardown();
    // No host element should remain.
    expect(document.querySelectorAll('#ketchup-host')).toHaveLength(0);
  });
});
