import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppTile } from '../../src/sidepanel/components/AppTile';
import teamsMeta from '../../src/plugins/teams.meta';

describe('AppTile', () => {
  it('renders label and No tab badge when no status', () => {
    render(<AppTile metadata={teamsMeta} status={undefined} loading={false} />);
    expect(screen.getByText(teamsMeta.label)).toBeInTheDocument();
    expect(screen.getByText('No tab')).toBeInTheDocument();
  });

  it('shows Tab open when a matching tab exists', () => {
    render(
      <AppTile
        metadata={teamsMeta}
        status={{ pluginId: 'teams', tabId: 7, url: 'https://teams.cloud.microsoft/' }}
        loading={false}
      />,
    );
    expect(screen.getByText('Tab open')).toBeInTheDocument();
  });

  it('Open button sends OPEN_AND_TOGGLE with plugin id', async () => {
    const send = vi.spyOn(chrome.runtime, 'sendMessage').mockResolvedValue({ ok: true });
    render(<AppTile metadata={teamsMeta} status={undefined} loading={false} />);
    fireEvent.click(screen.getByRole('button', { name: /open microsoft teams/i }));
    expect(send).toHaveBeenCalledWith({ type: 'OPEN_AND_TOGGLE', pluginId: 'teams' });
  });
});
