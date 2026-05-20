import type {
  User,
  Family,
  Member,
  Person,
  Condition,
  Category,
  PackingItem,
  Trip,
  TripItem,
  PresetKey,
} from "../types";

export interface CreateTripParams {
  familyId: string;
  name: string;
  startDate?: string;
  endDate?: string;
  durationDays: number;
  conditions: string[];
  hasWasher: boolean;
  washIntervalDays?: number;
}

export type SyncStatus = "local" | "syncing" | "error";

export interface DataProvider {
  // Auth (mocked in v1)
  getCurrentUser(): User | null;
  signIn(name: string, email: string): User;
  signOut(): void;
  updateCurrentUser(patch: Partial<Pick<User, "name" | "email">>): User;

  // Family
  getCurrentFamily(): Family | null;
  setCurrentFamily(familyId: string): void;
  createFamily(name: string, personNames: string[], presetKey: PresetKey): string;
  renameFamily(id: string, name: string): void;

  // Members (mocked)
  listMembers(familyId: string): Member[];

  // Persons
  listPersons(familyId: string): Person[];
  createPerson(
    familyId: string,
    name: string,
    color?: string,
    linkedUserId?: string,
    initials?: string,
    isPet?: boolean,
  ): string;
  updatePerson(id: string, patch: Partial<Omit<Person, "id" | "familyId">>): void;
  deletePerson(id: string): void;

  // Categories
  listCategories(familyId: string): Category[];
  /** Erstellt oder findet eine Kategorie nach Name (case-insensitive). */
  upsertCategory(familyId: string, name: string, icon?: string): Category;
  updateCategory(id: string, patch: Partial<Pick<Category, "name" | "icon">>): void;
  deleteCategory(id: string): void;
  /** Reordert eine Kategorie um eine Position. */
  moveCategory(id: string, direction: "up" | "down"): void;

  // Conditions
  listConditions(familyId: string): Condition[];
  createCustomCondition(familyId: string, label: string): string;
  deleteCustomCondition(familyId: string, key: string): void;

  // Packing items
  listPackingItems(familyId: string): PackingItem[];
  createPackingItem(item: Omit<PackingItem, "id">): string;
  updatePackingItem(id: string, patch: Partial<Omit<PackingItem, "id" | "familyId">>): void;
  deletePackingItem(id: string): void;
  movePackingItem(id: string, direction: "up" | "down"): void;

  // Trips
  listTrips(familyId: string): Trip[];
  getTrip(id: string): Trip | null;
  createTrip(params: CreateTripParams): string;
  duplicateTrip(
    sourceTripId: string,
    newName: string,
    newDurationDays: number,
    newStartDate?: string,
    newEndDate?: string,
  ): string;
  updateTrip(
    id: string,
    patch: Partial<
      Pick<
        Trip,
        | "name"
        | "startDate"
        | "endDate"
        | "durationDays"
        | "conditions"
        | "hasWasher"
        | "washIntervalDays"
      >
    >,
  ): void;
  archiveTrip(id: string): void;
  unarchiveTrip(id: string): void;
  deleteTrip(id: string): void;

  // Trip items
  listTripItems(tripId: string): TripItem[];
  setTripItemPacked(id: string, packedQty: number): void;
  addAdhocTripItem(
    item: Omit<TripItem, "id" | "packedQty" | "isPacked" | "lastPackedBy" | "lastPackedAt">,
  ): string;
  updateTripItem(
    id: string,
    patch: Partial<
      Pick<TripItem, "name" | "category" | "quantity" | "personId" | "baseQuantity" | "unit" | "perDays">
    >,
  ): void;
  deleteTripItem(id: string): void;
  /**
   * Setzt ein zuvor gelöschtes TripItem exakt wieder ein (inkl. id,
   * packedQty, lastPackedBy). Idempotent — wenn die id bereits existiert,
   * wird der bestehende Eintrag überschrieben. Für Undo-Funktionalität.
   */
  restoreTripItem(item: TripItem): void;
  mergeTemplatesIntoTrip(tripId: string): number;
  rebuildTripItemsFromTemplates(tripId: string): void;

  // Sync placeholder
  getSyncStatus(): SyncStatus;

  // Subscribe to any change — components re-render via this
  subscribe(listener: () => void): () => void;
}
