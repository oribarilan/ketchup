import { validatePluginMetadata, type PluginMetadata } from './types';
import teamsMeta from './teams.meta';
import outlookMeta from './outlook.meta';

/**
 * Single source of truth for which plugins ship.
 *
 * `PLUGIN_METADATA` is Node-safe and imported by `manifest.config.ts`,
 * `scripts/gen-rules.ts`, the background service worker, and the sidepanel.
 *
 * Full `Plugin` instances (metadata + DOM behavior) are exported from
 * `./registry-runtime` and imported only by content-script entries.
 */
export const PLUGIN_METADATA: readonly PluginMetadata[] = [teamsMeta, outlookMeta] as const;

PLUGIN_METADATA.forEach(validatePluginMetadata);
