import { randomUUID } from 'node:crypto';

export const uniqueEmail = (prefix = 'test'): string =>
  `${prefix}+${randomUUID().slice(0, 8)}@e2e.local`;
