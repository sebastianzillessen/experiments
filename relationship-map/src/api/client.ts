import type {
  Category,
  ContactFrequency,
  MapResponse,
  Person,
  RatingLogEntry,
  Settings,
  TimelineResponse,
} from "../types.ts";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // non-JSON error body — keep the default message
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  // Settings
  getSettings: () => request<Settings>("/api/settings"),
  updateSettings: (updates: Settings) =>
    request<Settings>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(updates),
    }),

  // Categories
  listCategories: () => request<Category[]>("/api/categories"),
  createCategory: (name: string, color: string) =>
    request<Category>("/api/categories", {
      method: "POST",
      body: JSON.stringify({ name, color }),
    }),
  updateCategory: (
    id: number,
    fields: Partial<Pick<Category, "name" | "color" | "sort_order">>,
  ) =>
    request<Category>(`/api/categories/${id}`, {
      method: "PUT",
      body: JSON.stringify(fields),
    }),
  deleteCategory: (id: number) =>
    request<void>(`/api/categories/${id}`, { method: "DELETE" }),

  // People
  listPeople: (includeArchived = false) =>
    request<Person[]>(`/api/people?includeArchived=${includeArchived}`),
  createPerson: (input: {
    name: string;
    category_id: number;
    contact_frequency: ContactFrequency;
    rating: number;
  }) =>
    request<Person>("/api/people", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updatePerson: (
    id: number,
    fields: Partial<
      Pick<Person, "name" | "category_id" | "contact_frequency" | "archived">
    >,
  ) =>
    request<Person>(`/api/people/${id}`, {
      method: "PUT",
      body: JSON.stringify(fields),
    }),
  changeRating: (id: number, rating: number, note?: string | null) =>
    request<Person>(`/api/people/${id}/rating`, {
      method: "PATCH",
      body: JSON.stringify({ rating, note: note ?? null }),
    }),
  getHistory: (id: number) =>
    request<RatingLogEntry[]>(`/api/people/${id}/history`),

  // Map / timeline
  getMap: (at?: string | null) =>
    request<MapResponse>(`/api/map${at ? `?at=${encodeURIComponent(at)}` : ""}`),
  getTimeline: () => request<TimelineResponse>("/api/timeline"),
};
