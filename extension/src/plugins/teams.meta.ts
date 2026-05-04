import type { PluginMetadata } from './types';

/**
 * Microsoft Teams plugin metadata. Node-safe — no DOM imports.
 */
const teamsMeta: PluginMetadata = {
  id: 'teams',
  label: 'Microsoft Teams',
  iconPath: 'icons/teams.svg',
  theme: { accent: '#6264a7', tileBg: '#6264a7' },
  matches: ['teams.cloud.microsoft', 'teams.microsoft.com'],
  iframeUrl: 'https://teams.cloud.microsoft/',
  headerStripDomains: ['teams.cloud.microsoft', 'teams.microsoft.com'],
  swipeLabels: { left: '← Mark Read', right: 'Keep →' },
};

export default teamsMeta;
