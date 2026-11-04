// Re-export the server's API types so the client uses the same definitions.
export type {
  Category,
  ContactFrequency,
  MapPerson,
  MapResponse,
  Person,
  RatingLogEntry,
  Settings,
  TimelineResponse,
} from "../server/types.ts";
export { CONTACT_FREQUENCIES } from "../server/types.ts";
