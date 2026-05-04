import type { PluginMetadata } from './types';

/**
 * Outlook Web (`outlook.office.com/mail/`) plugin metadata. Node-safe.
 *
 * Selectors for `outlook.live.com` consumer accounts are not validated; the
 * matcher accepts those hosts but the scraper is tuned for office.com.
 */
const outlookMeta: PluginMetadata = {
  id: 'outlook',
  label: 'Outlook',
  iconPath: 'icons/outlook.png',
  theme: { accent: '#0078d4', tileBg: '#0078d4' },
  matches: [
    'outlook.cloud.microsoft',
    'outlook.office.com',
    'outlook.office365.com',
    'outlook.live.com',
  ],
  iframeUrl: 'https://outlook.cloud.microsoft/mail/',
  headerStripDomains: [
    'outlook.cloud.microsoft',
    'outlook.office.com',
    'outlook.office365.com',
    'outlook.live.com',
  ],
  swipeLabels: { left: '← Archive', right: 'Keep →' },
  cardSize: { width: 720, height: 820 },
};

export default outlookMeta;
