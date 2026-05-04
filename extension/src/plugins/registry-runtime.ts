/**
 * Runtime plugin registry — full `Plugin` instances (metadata + DOM behavior).
 *
 * Imported only by content-script entries (browser context). For Node-safe
 * metadata (manifest, gen-rules, sidepanel, background), import from
 * `./registry` instead.
 */
import type { Plugin } from './types';
import teams from './teams';
import outlook from './outlook';

export const PLUGINS: readonly Plugin[] = [teams, outlook] as const;
