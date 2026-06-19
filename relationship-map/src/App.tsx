import { useMemo, useState } from "react";
import { CategoryLegend } from "./components/CategoryLegend.tsx";
import { PersonPanel } from "./components/PersonPanel.tsx";
import { RelationshipMap } from "./components/RelationshipMap.tsx";
import { TimeSlider } from "./components/TimeSlider.tsx";
import { Toolbar } from "./components/Toolbar.tsx";
import { useCategories } from "./hooks/useCategories.ts";
import { useMap } from "./hooks/useMap.ts";

export default function App() {
  const [at, setAt] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { categories, refresh: refreshCategories } = useCategories();
  const { map, timeline, refresh } = useMap(at);

  const liveMode = at === null;

  const selectedPerson = useMemo(
    () => map?.people.find((p) => p.id === selectedId) ?? null,
    [map, selectedId],
  );

  if (!map) {
    return <div className="loading">Loading…</div>;
  }

  return (
    <div className="app">
      <Toolbar
        selfName={map.self_name}
        categories={categories}
        liveMode={liveMode}
        onChanged={refresh}
      />

      <div className="layout">
        <CategoryLegend categories={categories} onChange={refreshCategories} />

        <main className="map-area">
          <RelationshipMap
            map={map}
            categories={categories}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
          <TimeSlider
            timeline={timeline}
            value={at}
            onChange={(next) => {
              setAt(next);
              setSelectedId(null);
            }}
          />
        </main>

        {selectedPerson && (
          <PersonPanel
            person={selectedPerson}
            categories={categories}
            liveMode={liveMode}
            onChanged={refresh}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </div>
  );
}
