import { randomUUID } from 'node:crypto';

// Use '-' instead of '+' so each test email has a unique local-part. Many mail
// servers (Inbucket with subaddress stripping, Gmail, etc.) route `foo+x@…` and
// `foo@…` to the same mailbox, which would collide in parallel test runs.
export const uniqueEmail = (prefix = 'test'): string =>
  `${prefix}-${randomUUID().slice(0, 8)}@e2e.local`;
