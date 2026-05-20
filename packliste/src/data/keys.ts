export const STORAGE_PREFIX = "packliste:";

export const K = {
  currentUser: `${STORAGE_PREFIX}current-user`,
  currentFamilyId: `${STORAGE_PREFIX}current-family-id`,
  families: `${STORAGE_PREFIX}families`,
  members: (familyId: string) => `${STORAGE_PREFIX}family:${familyId}:members`,
  persons: (familyId: string) => `${STORAGE_PREFIX}family:${familyId}:persons`,
  conditions: (familyId: string) => `${STORAGE_PREFIX}family:${familyId}:conditions`,
  categories: (familyId: string) => `${STORAGE_PREFIX}family:${familyId}:categories`,
  items: (familyId: string) => `${STORAGE_PREFIX}family:${familyId}:items`,
  trips: (familyId: string) => `${STORAGE_PREFIX}family:${familyId}:trips`,
  tripItems: (tripId: string) => `${STORAGE_PREFIX}trip:${tripId}:items`,
  // Migrations-Flags pro Familie (one-shot)
  migrated: (familyId: string, name: string) =>
    `${STORAGE_PREFIX}family:${familyId}:migrated:${name}`,
  // --- Sync-Metadaten (außerhalb des Snapshot-Datasets) ---
  /** ISO-Timestamp der letzten lokalen Mutation. */
  lastChangedAt: `${STORAGE_PREFIX}sync:last-changed-at`,
  /** ISO-Timestamp des letzten erfolgreichen Push. */
  lastPushedAt: `${STORAGE_PREFIX}sync:last-pushed-at`,
  /** ISO-Timestamp des letzten erfolgreichen Pull. */
  lastPulledAt: `${STORAGE_PREFIX}sync:last-pulled-at`,
  /** Aktiver Sync-Code (6 Zeichen) — wenn gesetzt, ist Auto-Sync aktiv. */
  syncCode: `${STORAGE_PREFIX}sync:code`,
};
