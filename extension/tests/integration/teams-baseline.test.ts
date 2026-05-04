/**
 * Regression baseline: validates the public `startTriage(plugin)` contract.
 *
 * This test MUST keep passing across the React rewrite (task 3). It does not
 * inspect overlay internals — it only verifies the contract:
 *  - calling startTriage mounts a host element on the page
 *  - calling teardown removes the host
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { startTriage } from '../../src/core';
import teams from '../../src/plugins/teams';

describe('startTriage(plugin) baseline', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('mounts a host element with id "fs-host"', () => {
    const handle = startTriage(teams);
    const host = document.getElementById('fs-host');
    expect(host).not.toBeNull();
    expect(host?.shadowRoot).not.toBeNull();
    handle.teardown();
  });

  it('teardown removes the host element', () => {
    const handle = startTriage(teams);
    expect(document.getElementById('fs-host')).not.toBeNull();
    handle.teardown();
    expect(document.getElementById('fs-host')).toBeNull();
  });

  it('teardown is idempotent', () => {
    const handle = startTriage(teams);
    handle.teardown();
    expect(() => handle.teardown()).not.toThrow();
  });
});
