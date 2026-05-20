export const STORAGE_PREFIX = "packliste:";

export const K = {
  currentUser: `${STORAGE_PREFIX}current-user`,
  currentFamilyId: `${STORAGE_PREFIX}current-family-id`,
  families: `${STORAGE_PREFIX}families`,
  members: (familyId: string) => `${STORAGE_PREFIX}family:${familyId}:members`,
  persons: (familyId: string) => `${STORAGE_PREFIX}family:${familyId}:persons`,
  conditions: (familyId: string) => `${STORAGE_PREFIX}family:${familyId}:conditions`,
  items: (familyId: string) => `${STORAGE_PREFIX}family:${familyId}:items`,
  trips: (familyId: string) => `${STORAGE_PREFIX}family:${familyId}:trips`,
  tripItems: (tripId: string) => `${STORAGE_PREFIX}trip:${tripId}:items`,
};
