// Shared types for the contact-import pipeline.

export type Channel = "whatsapp" | "imessage" | "mail";

/** A single interaction with a handle (phone or email), normalized. */
export interface InteractionEvent {
  channel: Channel;
  /** Normalized handle: digits for phones, lowercased address for emails. */
  handle: string;
  /** Unix epoch milliseconds. */
  tsMs: number;
  /** True when the message was sent by the user (is_from_me). */
  outgoing: boolean;
}

/** A contact as read from the macOS address book. */
export interface RawContact {
  /** Stable key within the address book (source uuid + record pk). */
  contactKey: string;
  displayName: string;
  /** Normalized phone numbers (digits only). */
  phones: string[];
  /** Normalized email addresses (lowercased). */
  emails: string[];
  /** True for the user's own "me" card — its handles are treated as self. */
  isMe: boolean;
}

/** A person after merging contacts with channel interactions. */
export interface ResolvedPerson {
  external_key: string;
  name: string;
  events: InteractionEvent[];
}
