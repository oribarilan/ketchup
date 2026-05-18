import { KetchupIcon } from '../core/components/KetchupIcon';
import { PLUGIN_METADATA } from '../plugins/registry';
import { AppTile } from './components/AppTile';
import { useTabStatus } from './hooks/useTabStatus';

export function App() {
  const { statuses, loading } = useTabStatus();
  return (
    <main className="ketchup-launcher">
      <header>
        <h1>
          <KetchupIcon size={22} color="#D94030" />
          Ketchup
        </h1>
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
