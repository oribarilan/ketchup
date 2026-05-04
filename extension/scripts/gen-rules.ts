/**
 * Generates `public/rules.json` from the plugin registry.
 *
 * Each plugin contributes one `declarativeNetRequest` modifyHeaders rule that
 * strips frame-blocking headers for sub-frame requests to its domains.
 *
 * Run automatically by Vite (`buildStart` hook in `vite.config.ts`) and
 * manually via `npm run gen-rules`.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLUGIN_METADATA } from '../src/plugins/registry';
import { validatePluginMetadata } from '../src/plugins/types';

const STRIP_HEADERS = [
  'x-frame-options',
  'content-security-policy',
  'content-security-policy-report-only',
  'frame-options',
] as const;

interface DnrRule {
  id: number;
  priority: number;
  action: {
    type: 'modifyHeaders';
    responseHeaders: { header: string; operation: 'remove' }[];
  };
  condition: {
    requestDomains: string[];
    resourceTypes: ('sub_frame' | 'main_frame')[];
  };
}

function build(): DnrRule[] {
  return PLUGIN_METADATA.map((meta, index) => {
    validatePluginMetadata(meta);
    return {
      id: 1000 + index,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        responseHeaders: STRIP_HEADERS.map((h) => ({
          header: h,
          operation: 'remove',
        })),
      },
      condition: {
        requestDomains: [...meta.headerStripDomains],
        resourceTypes: ['sub_frame'],
      },
    };
  });
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const out = resolve(__dirname, '..', 'public', 'rules.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(build(), null, 2) + '\n', 'utf8');
console.log(`[gen-rules] wrote ${out} (${PLUGIN_METADATA.length} rules)`);
