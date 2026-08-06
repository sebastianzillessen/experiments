import { useMemo, useState } from "react";
import { api } from "./api/client.ts";
import { CategoryLegend } from "./components/CategoryLegend.tsx";
import { ClassifyView } from "./components/ClassifyView.tsx";
import { MapFilterBar } from "./components/MapFilterBar.tsx";
import { PersonPanel } from "./components/PersonPanel.tsx";
import { RelationshipMap } from "./components/RelationshipMap.tsx";
import { TimeSlider } from "./components/TimeSlider.tsx";
import { Toolbar } from "./components/Toolbar.tsx";
import { useCategories } from "./hooks/useCategories.ts";
import { useMap } from "./hooks/useMap.ts";
import { applyFilters, NO_FILTERS, type MapFilters } from "./lib/filter.ts";
import { UNCATEGORISED } from "./lib/polar.ts";

type View = "map" | "classify";

export default function App() {
  const [at, setAt] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [view, setView] = useState<View>("map");
  const [filters, setFilters] = useState<MapFilters>(NO_FILTERS);
  const { categories, refresh: refreshCategories } = useCategories();
  const { map, timeline, refresh } = useMap(at);

  const liveMode = at === null;

  const selectedPerson = useMemo(
    () => map?.people.find((p) => p.id === selectedId) ?? null,
    [map, selectedId],
  );

  const uncategorisedId = useMemo(
    () => categories.find((c) => c.name === UNCATEGORISED)?.id ?? null,
    [categories],
  );

  const visiblePeople = useMemo(
    () => (map ? applyFilters(map.people, filters) : []),
    [map, filters],
  );

  function toggleVisibility(id: number) {
    setFilters((f) => ({
      ...f,
      hiddenGroups: f.hiddenGroups.includes(id)
        ? f.hiddenGroups.filter((x) => x !== id)
        : [...f.hiddenGroups, id],
    }));
  }

  // Drop on the map: distance sets rating, the wedge sets category. Both changes
  // are persisted (the rating change is logged for the time-slider).
  async function handleMove(id: number, rating: number, categoryId: number) {
    const person = map?.people.find((p) => p.id === id);
    if (!person) return;
    if (person.rating !== rating) await api.changeRating(id, rating);
    if (person.category_id !== categoryId) await api.updatePerson(id, { category_id: categoryId });
    refresh();
  }

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

      <nav className="tabs">
        <button className={view === "map" ? "active" : ""} onClick={() => setView("map")}>
          Map
        </button>
        <button
          className={view === "classify" ? "active" : ""}
          onClick={() => setView("classify")}
        >
          Classify
        </button>
      </nav>

      {view === "classify" ? (
        <ClassifyView
          categories={categories}
          onChanged={() => {
            refresh();
            refreshCategories();
          }}
        />
      ) : (
        <div className="layout">
          <CategoryLegend
            categories={categories}
            onChange={refreshCategories}
            hiddenGroups={filters.hiddenGroups}
            onToggleVisibility={toggleVisibility}
          />

          <main className="map-area">
            <MapFilterBar
              filters={filters}
              onChange={setFilters}
              uncategorisedId={uncategorisedId}
              shown={visiblePeople.length}
              total={map.people.length}
            />
            <RelationshipMap
              map={{ ...map, people: visiblePeople }}
              categories={categories}
              selectedId={selectedId}
              draggable={liveMode}
              onSelect={setSelectedId}
              onMove={handleMove}
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
      )}
    </div>
  );
}
