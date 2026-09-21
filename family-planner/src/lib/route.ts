// Which screen the address bar is pointing at.
//
// Hash routes rather than paths: the planner is a static bundle behind a
// worker, and "/kantone" would be a 404 on a hard reload unless the host
// learns about every screen. "#/kantone/GR" needs nothing from anybody, works
// offline in the installed app, and survives a share into a chat.
//
// The point is that a screen can be referenced — sent to the other parent,
// bookmarked, reopened where it was. The phone's back button then does what a
// back button should, which the old overlays never did.

import { CANTON_CODES } from './cantons.ts';

export type Route =
  | { name: 'plan' }
  | { name: 'household' }
  | { name: 'cantons'; canton: string | null };

export const PLAN: Route = { name: 'plan' };

/** Anything unreadable is the plan: a wrong link should land somewhere. */
export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (!parts.length) return PLAN;

  if (parts[0] === 'haushalt') return { name: 'household' };
  if (parts[0] === 'kantone') {
    const code = (parts[1] ?? '').toUpperCase();
    return { name: 'cantons', canton: CANTON_CODES.includes(code) ? code : null };
  }
  return PLAN;
}

export function routeHash(route: Route): string {
  if (route.name === 'household') return '#/haushalt';
  if (route.name === 'cantons') {
    return route.canton ? `#/kantone/${route.canton}` : '#/kantone';
  }
  return '#/';
}

export function sameRoute(a: Route, b: Route): boolean {
  return routeHash(a) === routeHash(b);
}
