import type {
  Category,
  Condition,
  Family,
  Member,
  PackingItem,
  Person,
  PresetKey,
  Trip,
  TripItem,
  User,
} from "../types";
import { K, STORAGE_PREFIX } from "./keys";
import {
  calculateQuantity,
  formatInitials,
  generateTripItems,
  matchKey,
} from "./derive";
import type { CreateTripParams, DataProvider, SyncStatus } from "./DataProvider";
import { DEFAULT_CONDITION_KEYS, TEMPLATE_PRESETS } from "../defaults";
import { CONDITION_LABELS, PERSON_COLORS, categoryIcon } from "../labels";

function uuid(): string {
  return crypto.randomUUID();
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

function remove(key: string): void {
  localStorage.removeItem(key);
}

function nowIso(): string {
  return new Date().toISOString();
}

function sortByOrder<T extends { sortOrder: number; name?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return (a.name ?? "").localeCompare(b.name ?? "", "de");
  });
}

/**
 * Lazy-migration: alte Persons ohne `initials` bekommen automatisch
 * Initialen aus dem Namen. Persons mit explizit gesetzten Initialen
 * bleiben unverändert.
 */
function normalizePerson(raw: unknown): Person {
  const p = raw as Person;
  if (p.initials?.trim()) return p;
  return { ...p, initials: formatInitials(p.name) };
}

/**
 * Lazy-migration: alte PackingItems mit `personId?: string` zu neuem
 * `personIds: string[]`-Schema konvertieren. Schreibt nicht zurück;
 * Mutationen tun das beim nächsten Write von alleine.
 */
function normalizePackingItem(raw: unknown): PackingItem {
  const { personId, personIds, ...rest } = raw as PackingItem & { personId?: string };
  if (Array.isArray(personIds)) return { ...rest, personIds } as PackingItem;
  const migrated = personId ? [personId] : [];
  return { ...rest, personIds: migrated } as PackingItem;
}

export class LocalStorageProvider implements DataProvider {
  private listeners = new Set<() => void>();
  /**
   * Wenn true, überspringt notify() das Setzen von lastChangedAt. Wird
   * verwendet, wenn der SyncManager Remote-Snapshots anwendet — der
   * lastChangedAt-Timestamp soll dann aus dem Snapshot kommen, nicht
   * "jetzt" sein, sonst würde unser nächster Push den remote-state
   * fälschlich als "lokal geändert" markieren.
   */
  private skipLastChangedOnNotify = false;

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    if (!this.skipLastChangedOnNotify) {
      localStorage.setItem(K.lastChangedAt, JSON.stringify(nowIso()));
    }
    for (const fn of this.listeners) fn();
  }

  // ---------- Sync-Metadaten ----------
  getLastChangedAt(): string | null {
    return read<string | null>(K.lastChangedAt, null);
  }
  getLastPushedAt(): string | null {
    return read<string | null>(K.lastPushedAt, null);
  }
  setLastPushedAt(iso: string): void {
    write(K.lastPushedAt, iso);
  }
  getLastPulledAt(): string | null {
    return read<string | null>(K.lastPulledAt, null);
  }
  setLastPulledAt(iso: string): void {
    write(K.lastPulledAt, iso);
  }
  getSyncCode(): string | null {
    return read<string | null>(K.syncCode, null);
  }
  setSyncCode(code: string | null): void {
    if (code === null) remove(K.syncCode);
    else write(K.syncCode, code);
    this.notify();
  }

  applyRemoteSnapshot(json: string): void {
    this.skipLastChangedOnNotify = true;
    try {
      this.importSnapshot(json);
      // lastChangedAt wird in importSnapshot nicht angefasst (wegen Flag).
      // Wir lesen den Snapshot-Timestamp und setzen ihn explizit:
      try {
        const parsed = JSON.parse(json) as { data?: Record<string, string | null> };
        const remoteChanged = parsed.data?.[K.lastChangedAt];
        if (typeof remoteChanged === "string") {
          localStorage.setItem(K.lastChangedAt, JSON.stringify(remoteChanged));
        }
      } catch {
        // ignore
      }
      this.setLastPulledAt(nowIso());
    } finally {
      this.skipLastChangedOnNotify = false;
    }
  }

  // ---------- Auth ----------
  getCurrentUser(): User | null {
    return read<User | null>(K.currentUser, null);
  }

  signIn(name: string, email: string): User {
    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedName || !trimmedEmail) throw new Error("Name und E-Mail erforderlich");
    const existing = this.getCurrentUser();
    const user: User = existing ?? { id: uuid(), name: trimmedName, email: trimmedEmail };
    user.name = trimmedName;
    user.email = trimmedEmail;
    write(K.currentUser, user);
    this.notify();
    return user;
  }

  signOut(): void {
    remove(K.currentUser);
    remove(K.currentFamilyId);
    this.notify();
  }

  updateCurrentUser(patch: Partial<Pick<User, "name" | "email">>): User {
    const u = this.getCurrentUser();
    if (!u) throw new Error("Nicht angemeldet");
    const next: User = {
      ...u,
      name: patch.name?.trim() || u.name,
      email: patch.email?.trim().toLowerCase() || u.email,
    };
    write(K.currentUser, next);
    // Update member records in all families.
    const families = read<Family[]>(K.families, []);
    for (const f of families) {
      const members = read<Member[]>(K.members(f.id), []);
      const idx = members.findIndex((m) => m.userId === next.id);
      if (idx >= 0) {
        members[idx] = {
          ...members[idx],
          fullName: next.name,
          initials: formatInitials(next.name),
        };
        write(K.members(f.id), members);
      }
    }
    this.notify();
    return next;
  }

  // ---------- Family ----------
  getCurrentFamily(): Family | null {
    const id = read<string | null>(K.currentFamilyId, null);
    if (!id) return null;
    const all = read<Family[]>(K.families, []);
    return all.find((f) => f.id === id) ?? null;
  }

  setCurrentFamily(familyId: string): void {
    write(K.currentFamilyId, familyId);
    this.notify();
  }

  createFamily(name: string, personNames: string[], presetKey: PresetKey): string {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Familienname erforderlich");
    const user = this.getCurrentUser();
    if (!user) throw new Error("Nicht angemeldet");

    const family: Family = { id: uuid(), name: trimmed, createdAt: nowIso() };
    const families = read<Family[]>(K.families, []);
    families.push(family);
    write(K.families, families);

    const member: Member = {
      userId: user.id,
      familyId: family.id,
      role: "owner",
      fullName: user.name,
      initials: formatInitials(user.name),
    };
    write(K.members(family.id), [member]);

    const cleanNames = personNames.map((n) => n.trim()).filter(Boolean);
    const persons: Person[] = cleanNames.map((n, i) => ({
      id: uuid(),
      familyId: family.id,
      name: n,
      color: PERSON_COLORS[i % PERSON_COLORS.length],
      initials: formatInitials(n),
      linkedUserId: i === 0 ? user.id : undefined,
      sortOrder: i,
    }));
    write(K.persons(family.id), persons);

    write(K.conditions(family.id), []);

    const seedItems = TEMPLATE_PRESETS[presetKey];
    const items: PackingItem[] = seedItems.map((s, i) => ({
      id: uuid(),
      familyId: family.id,
      personIds: [],
      ...s,
      sortOrder: i,
    }));
    write(K.items(family.id), items);

    write(K.trips(family.id), []);

    write(K.currentFamilyId, family.id);
    this.notify();
    return family.id;
  }

  renameFamily(id: string, name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    const families = read<Family[]>(K.families, []);
    const idx = families.findIndex((f) => f.id === id);
    if (idx < 0) return;
    families[idx] = { ...families[idx], name: trimmed };
    write(K.families, families);
    this.notify();
  }

  // ---------- Members ----------
  listMembers(familyId: string): Member[] {
    return read<Member[]>(K.members(familyId), []);
  }

  // ---------- Persons ----------
  listPersons(familyId: string): Person[] {
    return sortByOrder(read<Person[]>(K.persons(familyId), []).map(normalizePerson));
  }

  createPerson(
    familyId: string,
    name: string,
    color?: string,
    linkedUserId?: string,
    initials?: string,
    isPet?: boolean,
  ): string {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Name erforderlich");
    const list = read<Person[]>(K.persons(familyId), []).map(normalizePerson);
    const sortOrder = list.reduce((m, p) => Math.max(m, p.sortOrder), -1) + 1;
    const cleanInitials = initials?.trim().toUpperCase().slice(0, 3);
    const person: Person = {
      id: uuid(),
      familyId,
      name: trimmed,
      color: color ?? PERSON_COLORS[list.length % PERSON_COLORS.length],
      initials: cleanInitials || formatInitials(trimmed),
      isPet: isPet ?? false,
      linkedUserId,
      sortOrder,
    };
    list.push(person);
    write(K.persons(familyId), list);
    this.notify();
    return person.id;
  }

  updatePerson(id: string, patch: Partial<Omit<Person, "id" | "familyId">>): void {
    const families = read<Family[]>(K.families, []);
    for (const f of families) {
      const list = read<Person[]>(K.persons(f.id), []).map(normalizePerson);
      const idx = list.findIndex((p) => p.id === id);
      if (idx < 0) continue;
      // Wenn der Name geändert wird und keine expliziten Initialen in der
      // Patch sind, Initialen leeren — beim nächsten Read regeneriert sie
      // normalizePerson aus dem neuen Namen. Falls patch explicit Initialen
      // setzt (auch ""), wird das respektiert.
      const next: Person = { ...list[idx], ...patch };
      if (patch.name !== undefined && patch.initials === undefined) {
        next.initials = formatInitials(next.name);
      }
      // Initialen normalisieren: trim, upper, max 3 chars
      if (next.initials !== undefined) {
        next.initials = next.initials.trim().toUpperCase().slice(0, 3) || formatInitials(next.name);
      }
      list[idx] = next;
      write(K.persons(f.id), list);
      this.notify();
      return;
    }
  }

  deletePerson(id: string): void {
    const families = read<Family[]>(K.families, []);
    for (const f of families) {
      const list = read<Person[]>(K.persons(f.id), []).map(normalizePerson);
      const idx = list.findIndex((p) => p.id === id);
      if (idx < 0) continue;
      list.splice(idx, 1);
      write(K.persons(f.id), list);
      // remove person from packing_items.personIds and trip_items.personId
      const items = read<PackingItem[]>(K.items(f.id), []).map(normalizePackingItem);
      let changed = false;
      for (const it of items) {
        if (it.personIds.includes(id)) {
          it.personIds = it.personIds.filter((pid) => pid !== id);
          changed = true;
        }
      }
      if (changed) write(K.items(f.id), items);
      const trips = read<Trip[]>(K.trips(f.id), []);
      for (const t of trips) {
        const ti = read<TripItem[]>(K.tripItems(t.id), []);
        let tichanged = false;
        for (const it of ti) {
          if (it.personId === id) {
            it.personId = undefined;
            tichanged = true;
          }
        }
        if (tichanged) write(K.tripItems(t.id), ti);
      }
      this.notify();
      return;
    }
  }

  // ---------- Conditions ----------
  listConditions(familyId: string): Condition[] {
    const customs = read<Condition[]>(K.conditions(familyId), []);
    const defaults: Condition[] = DEFAULT_CONDITION_KEYS.map((k) => ({
      key: k,
      label: CONDITION_LABELS[k].label,
      isCustom: false,
    }));
    return [...defaults, ...customs];
  }

  createCustomCondition(familyId: string, label: string): string {
    const trimmed = label.trim();
    if (!trimmed) throw new Error("Label erforderlich");
    const key = `custom-${uuid()}`;
    const list = read<Condition[]>(K.conditions(familyId), []);
    list.push({ key, label: trimmed, isCustom: true });
    write(K.conditions(familyId), list);
    this.notify();
    return key;
  }

  deleteCustomCondition(familyId: string, key: string): void {
    const list = read<Condition[]>(K.conditions(familyId), []);
    const idx = list.findIndex((c) => c.key === key);
    if (idx < 0) return;
    list.splice(idx, 1);
    write(K.conditions(familyId), list);
    // remove from items and trips referencing it
    const items = read<PackingItem[]>(K.items(familyId), []).map(normalizePackingItem);
    let changed = false;
    for (const it of items) {
      if (it.conditions.includes(key)) {
        it.conditions = it.conditions.filter((c) => c !== key);
        changed = true;
      }
    }
    if (changed) write(K.items(familyId), items);
    const trips = read<Trip[]>(K.trips(familyId), []);
    let tchanged = false;
    for (const t of trips) {
      if (t.conditions.includes(key)) {
        t.conditions = t.conditions.filter((c) => c !== key);
        tchanged = true;
      }
    }
    if (tchanged) write(K.trips(familyId), trips);
    this.notify();
  }

  // ---------- Packing items (templates) ----------
  listPackingItems(familyId: string): PackingItem[] {
    this.ensureDefaultConditionMigration(familyId);
    return sortByOrder(read<PackingItem[]>(K.items(familyId), []).map(normalizePackingItem));
  }

  /**
   * Einmalige Migration: Bestandsitems mit `conditions: []` (vor dem
   * Wechsel der Semantik "leer = immer einpacken") bekommen jetzt
   * `conditions: ['default']`, damit sie weiterhin auf neuen Trips
   * landen. Neu erstellte Items entscheiden frei — empty = Sonderbedarf.
   */
  private ensureDefaultConditionMigration(familyId: string): void {
    const flagKey = K.migrated(familyId, "default-condition");
    if (localStorage.getItem(flagKey) === "1") return;
    const items = read<PackingItem[]>(K.items(familyId), []).map(normalizePackingItem);
    let changed = false;
    for (const it of items) {
      if (!it.conditions || it.conditions.length === 0) {
        it.conditions = ["default"];
        changed = true;
      }
    }
    if (changed) write(K.items(familyId), items);
    localStorage.setItem(flagKey, "1");
  }

  createPackingItem(item: Omit<PackingItem, "id">): string {
    const list = read<PackingItem[]>(K.items(item.familyId), []).map(normalizePackingItem);
    const sortOrder =
      item.sortOrder ?? list.reduce((m, i) => Math.max(m, i.sortOrder), -1) + 1;
    const next: PackingItem = {
      ...item,
      id: uuid(),
      sortOrder,
      personIds: item.personIds ?? [],
    };
    list.push(next);
    write(K.items(item.familyId), list);
    if (next.category) this.upsertCategory(next.familyId, next.category);
    this.notify();
    return next.id;
  }

  updatePackingItem(id: string, patch: Partial<Omit<PackingItem, "id" | "familyId">>): void {
    const families = read<Family[]>(K.families, []);
    for (const f of families) {
      const list = read<PackingItem[]>(K.items(f.id), []).map(normalizePackingItem);
      const idx = list.findIndex((i) => i.id === id);
      if (idx < 0) continue;
      list[idx] = { ...list[idx], ...patch };
      write(K.items(f.id), list);
      // Wenn eine neue Kategorie verwendet wird, automatisch in der
      // Kategorie-Liste anlegen
      if (patch.category) this.upsertCategory(f.id, patch.category);
      this.notify();
      return;
    }
  }

  deletePackingItem(id: string): void {
    const families = read<Family[]>(K.families, []);
    for (const f of families) {
      const list = read<PackingItem[]>(K.items(f.id), []).map(normalizePackingItem);
      const idx = list.findIndex((i) => i.id === id);
      if (idx < 0) continue;
      list.splice(idx, 1);
      write(K.items(f.id), list);
      this.notify();
      return;
    }
  }

  movePackingItem(id: string, direction: "up" | "down"): void {
    const families = read<Family[]>(K.families, []);
    for (const f of families) {
      const list = sortByOrder(read<PackingItem[]>(K.items(f.id), []).map(normalizePackingItem));
      const idx = list.findIndex((i) => i.id === id);
      if (idx < 0) continue;
      const swapWith = direction === "up" ? idx - 1 : idx + 1;
      if (swapWith < 0 || swapWith >= list.length) return;
      const a = list[idx];
      const b = list[swapWith];
      const tmp = a.sortOrder;
      a.sortOrder = b.sortOrder;
      b.sortOrder = tmp;
      write(K.items(f.id), list);
      this.notify();
      return;
    }
  }

  reorderPackingItems(familyId: string, orderedIds: string[]): void {
    const list = read<PackingItem[]>(K.items(familyId), []).map(normalizePackingItem);
    const order = new Map(orderedIds.map((id, i) => [id, i]));
    for (const it of list) {
      const o = order.get(it.id);
      if (o !== undefined) it.sortOrder = o;
    }
    write(K.items(familyId), list);
    this.notify();
  }

  // ---------- Trips ----------
  listTrips(familyId: string): Trip[] {
    const all = read<Trip[]>(K.trips(familyId), []);
    return [...all].sort((a, b) => {
      const aArchived = a.archivedAt != null;
      const bArchived = b.archivedAt != null;
      if (aArchived !== bArchived) return aArchived ? 1 : -1;
      const aKey = a.startDate ?? a.createdAt;
      const bKey = b.startDate ?? b.createdAt;
      return bKey.localeCompare(aKey);
    });
  }

  getTrip(id: string): Trip | null {
    const families = read<Family[]>(K.families, []);
    for (const f of families) {
      const list = read<Trip[]>(K.trips(f.id), []);
      const t = list.find((x) => x.id === id);
      if (t) return t;
    }
    return null;
  }

  createTrip(params: CreateTripParams): string {
    const user = this.getCurrentUser();
    if (!user) throw new Error("Nicht angemeldet");
    const trip: Trip = {
      id: uuid(),
      familyId: params.familyId,
      name: params.name.trim() || "Neuer Trip",
      startDate: params.startDate,
      endDate: params.endDate,
      durationDays: Math.max(1, Math.round(params.durationDays)),
      conditions: [...params.conditions],
      hasWasher: params.hasWasher,
      washIntervalDays: params.hasWasher ? params.washIntervalDays ?? 3 : undefined,
      createdBy: user.id,
      createdAt: nowIso(),
    };
    const trips = read<Trip[]>(K.trips(params.familyId), []);
    trips.push(trip);
    write(K.trips(params.familyId), trips);

    // Seed trip items from templates
    const templates = read<PackingItem[]>(K.items(params.familyId), []).map(normalizePackingItem);
    const seeds = generateTripItems(templates, trip);
    const items: TripItem[] = seeds.map((s) => ({
      ...s,
      id: uuid(),
      packedQty: 0,
      isPacked: false,
    }));
    write(K.tripItems(trip.id), items);

    this.notify();
    return trip.id;
  }

  duplicateTrip(
    sourceTripId: string,
    newName: string,
    newDurationDays: number,
    newStartDate?: string,
    newEndDate?: string,
  ): string {
    const user = this.getCurrentUser();
    if (!user) throw new Error("Nicht angemeldet");
    const source = this.getTrip(sourceTripId);
    if (!source) throw new Error("Quell-Trip nicht gefunden");
    const sourceItems = read<TripItem[]>(K.tripItems(sourceTripId), []);

    const days = Math.max(1, Math.round(newDurationDays));
    const newTrip: Trip = {
      id: uuid(),
      familyId: source.familyId,
      name: newName.trim() || `${source.name} (Kopie)`,
      startDate: newStartDate,
      endDate: newEndDate,
      durationDays: days,
      conditions: [...source.conditions],
      hasWasher: source.hasWasher,
      washIntervalDays: source.washIntervalDays,
      createdBy: user.id,
      createdAt: nowIso(),
    };
    const trips = read<Trip[]>(K.trips(source.familyId), []);
    trips.push(newTrip);
    write(K.trips(source.familyId), trips);

    // Rescale per_day items based on stored base_quantity + unit
    const newItems: TripItem[] = sourceItems.map((s) => ({
      ...s,
      id: uuid(),
      tripId: newTrip.id,
      quantity: calculateQuantity(
        { baseQuantity: s.baseQuantity, unit: s.unit, washable: s.washable, perDays: s.perDays },
        newTrip,
      ),
      packedQty: 0,
      isPacked: false,
      lastPackedBy: undefined,
      lastPackedAt: undefined,
    }));
    write(K.tripItems(newTrip.id), newItems);
    this.notify();
    return newTrip.id;
  }

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
  ): void {
    const families = read<Family[]>(K.families, []);
    for (const f of families) {
      const list = read<Trip[]>(K.trips(f.id), []);
      const idx = list.findIndex((t) => t.id === id);
      if (idx < 0) continue;
      const before = list[idx];
      const after: Trip = { ...before, ...patch };
      list[idx] = after;
      write(K.trips(f.id), list);
      // If duration or washer settings changed, rescale per_day quantities (preserve packed_qty up to new max)
      const rescale =
        patch.durationDays !== undefined ||
        patch.hasWasher !== undefined ||
        patch.washIntervalDays !== undefined;
      if (rescale) {
        const items = read<TripItem[]>(K.tripItems(id), []);
        const updated = items.map((it) => {
          const newQty = calculateQuantity(
            { baseQuantity: it.baseQuantity, unit: it.unit, washable: it.washable, perDays: it.perDays },
            after,
          );
          const packedQty = Math.min(it.packedQty, newQty);
          return {
            ...it,
            quantity: newQty,
            packedQty,
            isPacked: packedQty >= newQty,
          };
        });
        write(K.tripItems(id), updated);
      }
      this.notify();
      return;
    }
  }

  archiveTrip(id: string): void {
    this.updateTripFlag(id, { archivedAt: nowIso() });
  }

  unarchiveTrip(id: string): void {
    this.updateTripFlag(id, { archivedAt: undefined });
  }

  private updateTripFlag(id: string, patch: Partial<Trip>): void {
    const families = read<Family[]>(K.families, []);
    for (const f of families) {
      const list = read<Trip[]>(K.trips(f.id), []);
      const idx = list.findIndex((t) => t.id === id);
      if (idx < 0) continue;
      list[idx] = { ...list[idx], ...patch };
      write(K.trips(f.id), list);
      this.notify();
      return;
    }
  }

  deleteTrip(id: string): void {
    const families = read<Family[]>(K.families, []);
    for (const f of families) {
      const list = read<Trip[]>(K.trips(f.id), []);
      const idx = list.findIndex((t) => t.id === id);
      if (idx < 0) continue;
      list.splice(idx, 1);
      write(K.trips(f.id), list);
      remove(K.tripItems(id));
      this.notify();
      return;
    }
  }

  // ---------- Trip items ----------
  listTripItems(tripId: string): TripItem[] {
    const items = read<TripItem[]>(K.tripItems(tripId), []);
    return items.map((it) => ({ ...it, isPacked: it.packedQty >= it.quantity }));
  }

  setTripItemPacked(id: string, packedQty: number): void {
    const trip = this.findTripContaining(id);
    if (!trip) return;
    const user = this.getCurrentUser();
    const items = read<TripItem[]>(K.tripItems(trip.id), []);
    const idx = items.findIndex((i) => i.id === id);
    if (idx < 0) return;
    const it = items[idx];
    const clamped = Math.max(0, Math.min(it.quantity, Math.round(packedQty)));
    items[idx] = {
      ...it,
      packedQty: clamped,
      isPacked: clamped >= it.quantity,
      lastPackedBy: user?.id,
      lastPackedAt: nowIso(),
    };
    write(K.tripItems(trip.id), items);
    this.notify();
  }

  addAdhocTripItem(
    item: Omit<TripItem, "id" | "packedQty" | "isPacked" | "lastPackedBy" | "lastPackedAt">,
  ): string {
    const items = read<TripItem[]>(K.tripItems(item.tripId), []);
    const next: TripItem = {
      ...item,
      id: uuid(),
      packedQty: 0,
      isPacked: false,
    };
    items.push(next);
    write(K.tripItems(item.tripId), items);
    this.notify();
    return next.id;
  }

  updateTripItem(
    id: string,
    patch: Partial<
      Pick<TripItem, "name" | "category" | "quantity" | "personId" | "baseQuantity" | "unit" | "perDays">
    >,
  ): void {
    const trip = this.findTripContaining(id);
    if (!trip) return;
    const items = read<TripItem[]>(K.tripItems(trip.id), []);
    const idx = items.findIndex((i) => i.id === id);
    if (idx < 0) return;
    const merged = { ...items[idx], ...patch };
    merged.isPacked = merged.packedQty >= merged.quantity;
    items[idx] = merged;
    write(K.tripItems(trip.id), items);
    this.notify();
  }

  deleteTripItem(id: string): void {
    const trip = this.findTripContaining(id);
    if (!trip) return;
    const items = read<TripItem[]>(K.tripItems(trip.id), []);
    const idx = items.findIndex((i) => i.id === id);
    if (idx < 0) return;
    items.splice(idx, 1);
    write(K.tripItems(trip.id), items);
    this.notify();
  }

  restoreTripItem(item: TripItem): void {
    const items = read<TripItem[]>(K.tripItems(item.tripId), []);
    // Falls die id schon existiert: ersetzen statt duplizieren
    const idx = items.findIndex((i) => i.id === item.id);
    if (idx >= 0) items[idx] = item;
    else items.push(item);
    write(K.tripItems(item.tripId), items);
    this.notify();
  }

  mergeTemplatesIntoTrip(tripId: string): number {
    const trip = this.getTrip(tripId);
    if (!trip) return 0;
    const templates = read<PackingItem[]>(K.items(trip.familyId), []).map(normalizePackingItem);
    const existing = read<TripItem[]>(K.tripItems(tripId), []);
    const existingKeys = new Set(existing.map(matchKey));
    const seeds = generateTripItems(templates, trip).filter(
      (s) => !existingKeys.has(matchKey(s)),
    );
    if (seeds.length === 0) return 0;
    const newItems: TripItem[] = seeds.map((s) => ({
      ...s,
      id: uuid(),
      packedQty: 0,
      isPacked: false,
    }));
    write(K.tripItems(tripId), [...existing, ...newItems]);
    this.notify();
    return newItems.length;
  }

  rebuildTripItemsFromTemplates(tripId: string): void {
    const trip = this.getTrip(tripId);
    if (!trip) return;
    const templates = read<PackingItem[]>(K.items(trip.familyId), []).map(normalizePackingItem);
    const seeds = generateTripItems(templates, trip);
    const items: TripItem[] = seeds.map((s) => ({
      ...s,
      id: uuid(),
      packedQty: 0,
      isPacked: false,
    }));
    write(K.tripItems(tripId), items);
    this.notify();
  }

  // ---------- Categories ----------
  listCategories(familyId: string): Category[] {
    // Lazy-Sync: aus existierenden Items eventuell fehlende Kategorien
    // ergänzen. Damit funktionieren auch Family-Daten, die vor dem
    // Category-Refactor angelegt wurden.
    const stored = read<Category[]>(K.categories(familyId), []);
    const items = read<PackingItem[]>(K.items(familyId), []).map(normalizePackingItem);
    const namesInItems = new Set(
      items.map((i) => i.category?.trim()).filter((c): c is string => Boolean(c)),
    );
    const existingNames = new Set(stored.map((c) => c.name.toLowerCase()));
    const additions: Category[] = [];
    for (const name of namesInItems) {
      if (!existingNames.has(name.toLowerCase())) {
        additions.push({
          id: uuid(),
          familyId,
          name,
          icon: categoryIcon(name),
          sortOrder: stored.length + additions.length,
        });
        existingNames.add(name.toLowerCase());
      }
    }
    if (additions.length > 0) {
      const next = [...stored, ...additions];
      write(K.categories(familyId), next);
      return [...next].sort((a, b) => a.sortOrder - b.sortOrder);
    }
    return [...stored].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  upsertCategory(familyId: string, name: string, icon?: string): Category {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Kategorie-Name erforderlich");
    const list = read<Category[]>(K.categories(familyId), []);
    const existing = list.find((c) => c.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      // Falls icon explizit gesetzt wird, übernehmen
      if (icon && existing.icon !== icon) {
        existing.icon = icon;
        write(K.categories(familyId), list);
        this.notify();
      }
      return existing;
    }
    const next: Category = {
      id: uuid(),
      familyId,
      name: trimmed,
      icon: icon || categoryIcon(trimmed),
      sortOrder: list.length,
    };
    list.push(next);
    write(K.categories(familyId), list);
    this.notify();
    return next;
  }

  updateCategory(id: string, patch: Partial<Pick<Category, "name" | "icon">>): void {
    const families = read<Family[]>(K.families, []);
    for (const f of families) {
      const list = read<Category[]>(K.categories(f.id), []);
      const idx = list.findIndex((c) => c.id === id);
      if (idx < 0) continue;
      const before = list[idx];
      const after: Category = { ...before, ...patch };
      if (patch.name !== undefined) after.name = patch.name.trim();
      list[idx] = after;
      write(K.categories(f.id), list);
      // Cascade: bei Rename die items auf die neue Bezeichnung migrieren,
      // damit der Filter in der Vorlage weiterhin matched
      if (patch.name !== undefined && before.name !== after.name) {
        const items = read<PackingItem[]>(K.items(f.id), []).map(normalizePackingItem);
        let changed = false;
        for (const it of items) {
          if (it.category === before.name) {
            it.category = after.name;
            changed = true;
          }
        }
        if (changed) write(K.items(f.id), items);
      }
      this.notify();
      return;
    }
  }

  deleteCategory(id: string): void {
    const families = read<Family[]>(K.families, []);
    for (const f of families) {
      const list = read<Category[]>(K.categories(f.id), []);
      const idx = list.findIndex((c) => c.id === id);
      if (idx < 0) continue;
      const removed = list[idx];
      list.splice(idx, 1);
      write(K.categories(f.id), list);
      // Items dieser Kategorie verlieren ihre Zuordnung (werden zu "Sonstiges")
      const items = read<PackingItem[]>(K.items(f.id), []).map(normalizePackingItem);
      let changed = false;
      for (const it of items) {
        if (it.category === removed.name) {
          it.category = "";
          changed = true;
        }
      }
      if (changed) write(K.items(f.id), items);
      this.notify();
      return;
    }
  }

  moveCategory(id: string, direction: "up" | "down"): void {
    const families = read<Family[]>(K.families, []);
    for (const f of families) {
      const list = read<Category[]>(K.categories(f.id), []).sort(
        (a, b) => a.sortOrder - b.sortOrder,
      );
      const idx = list.findIndex((c) => c.id === id);
      if (idx < 0) continue;
      const swapWith = direction === "up" ? idx - 1 : idx + 1;
      if (swapWith < 0 || swapWith >= list.length) return;
      const a = list[idx];
      const b = list[swapWith];
      const tmp = a.sortOrder;
      a.sortOrder = b.sortOrder;
      b.sortOrder = tmp;
      write(K.categories(f.id), list);
      this.notify();
      return;
    }
  }

  reorderCategories(familyId: string, orderedIds: string[]): void {
    const list = read<Category[]>(K.categories(familyId), []);
    const order = new Map(orderedIds.map((id, i) => [id, i]));
    for (const c of list) {
      const o = order.get(c.id);
      if (o !== undefined) c.sortOrder = o;
    }
    write(K.categories(familyId), list);
    this.notify();
  }

  // ---------- Sync ----------
  getSyncStatus(): SyncStatus {
    return "local";
  }

  exportSnapshot(): string {
    const data: Record<string, unknown> = {};
    // Per-Browser-Sync-Bookkeeping nicht mit-synchronisieren — sonst
    // würde Browser B nach einem Pull plötzlich glauben, er hätte
    // gepusht/gepullt was Browser A getan hat.
    const skip = new Set<string>([K.lastPushedAt, K.lastPulledAt, K.syncCode]);
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(STORAGE_PREFIX)) continue;
      if (skip.has(key)) continue;
      const raw = localStorage.getItem(key);
      if (raw == null) continue;
      try {
        data[key] = JSON.parse(raw);
      } catch {
        data[key] = raw;
      }
    }
    const snapshot = {
      schema: "packliste-v1",
      exportedAt: new Date().toISOString(),
      data,
    };
    return JSON.stringify(snapshot, null, 2);
  }

  async shareSnapshotToRemote(): Promise<string> {
    const json = this.exportSnapshot();
    const res = await fetch("/api/packliste/share", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: json,
    });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const body = (await res.json()) as { error?: string };
        if (body.error) msg = body.error;
      } catch {
        // ignore
      }
      throw new Error(msg);
    }
    const data = (await res.json()) as { code: string };
    if (!data.code) throw new Error("Kein Code vom Server erhalten");
    return data.code;
  }

  async loadSharedSnapshot(code: string): Promise<void> {
    const cleaned = code.trim().toUpperCase().replace(/\s+/g, "");
    if (!/^[A-Z2-9]{6}$/.test(cleaned)) {
      throw new Error("Code muss 6 Zeichen lang sein (A-Z, 2-9)");
    }
    const res = await fetch(`/api/packliste/share/${cleaned}`);
    if (res.status === 404) {
      throw new Error("Code nicht gefunden oder abgelaufen (30 Tage TTL)");
    }
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const body = (await res.json()) as { error?: string };
        if (body.error) msg = body.error;
      } catch {
        // ignore
      }
      throw new Error(msg);
    }
    const json = await res.text();
    this.importSnapshot(json);
  }

  importSnapshot(json: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new Error("Ungültige JSON-Datei");
    }
    if (!parsed || typeof parsed !== "object") {
      throw new Error("Ungültiges Snapshot-Format");
    }
    const snap = parsed as { schema?: string; data?: Record<string, unknown> };
    if (snap.schema !== "packliste-v1") {
      throw new Error(`Inkompatibles Schema: ${snap.schema ?? "unbekannt"}`);
    }
    if (!snap.data || typeof snap.data !== "object") {
      throw new Error("Snapshot hat keine Daten");
    }
    // Per-Browser-Sync-Bookkeeping NICHT löschen — sonst verliert
    // dieser Browser beim Pull seinen Sync-Code und Push/Pull-Timestamps.
    const preserve = new Set<string>([K.lastPushedAt, K.lastPulledAt, K.syncCode]);
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_PREFIX) && !preserve.has(key)) {
        toRemove.push(key);
      }
    }
    for (const k of toRemove) localStorage.removeItem(k);
    // Dann die importierten Keys schreiben (preserved auch nicht überschreiben)
    for (const [key, value] of Object.entries(snap.data)) {
      if (!key.startsWith(STORAGE_PREFIX)) continue;
      if (preserve.has(key)) continue;
      localStorage.setItem(key, JSON.stringify(value));
    }
    this.notify();
  }

  // ---------- Helpers ----------
  private findTripContaining(tripItemId: string): Trip | null {
    const families = read<Family[]>(K.families, []);
    for (const f of families) {
      const trips = read<Trip[]>(K.trips(f.id), []);
      for (const t of trips) {
        const items = read<TripItem[]>(K.tripItems(t.id), []);
        if (items.some((i) => i.id === tripItemId)) return t;
      }
    }
    return null;
  }
}
