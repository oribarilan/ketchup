import { PLUGIN_METADATA } from '../plugins/registry';
import { AppTile } from './components/AppTile';
import { useTabStatus } from './hooks/useTabStatus';

export function App() {
  const { statuses, loading } = useTabStatus();
  return (
    <main className="fs-launcher">
      <header>
        <h1>fs</h1>
        <p className="hint">Pick an app to triage</p>
      </header>
      <ul className="tile-grid">
        {PLUGIN_METADATA.map((m) => (
          <AppTile key={m.id} metadata={m} status={statuses[m.id]} loading={loading} />
        ))}
      </ul>
    </main>
  );
}
