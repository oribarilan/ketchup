import { defineManifest } from '@crxjs/vite-plugin';
import { PLUGIN_METADATA } from './src/plugins/registry';

const allMatches = PLUGIN_METADATA.flatMap((p) => p.matches.map((h) => `https://${h}/*`));

export default defineManifest({
  manifest_version: 3,
  name: 'fs',
  version: '0.4.0',
  description: 'Swipe-card triage for unread items across web apps.',
  action: {
    default_title: 'fs',
    default_icon: {
      '16': 'icons/icon16.png',
      '48': 'icons/icon48.png',
      '128': 'icons/icon128.png',
    },
  },
  side_panel: { default_path: 'src/sidepanel/index.html' },
  background: { service_worker: 'src/background/index.ts', type: 'module' },
  content_scripts: PLUGIN_METADATA.map((p) => ({
    matches: p.matches.map((h) => `https://${h}/*`),
    js: [`src/entries/${p.id}.content.ts`],
    run_at: 'document_idle',
  })),
  host_permissions: allMatches,
  permissions: ['activeTab', 'scripting', 'declarativeNetRequest', 'sidePanel', 'tabs'],
  declarative_net_request: {
    rule_resources: [{ id: 'header_strip', enabled: true, path: 'public/rules.json' }],
  },
  icons: {
    '16': 'icons/icon16.png',
    '48': 'icons/icon48.png',
    '128': 'icons/icon128.png',
  },
});
