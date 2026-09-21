import { describe, expect, it } from 'vitest';
import { PLAN, parseHash, routeHash, sameRoute } from '../src/lib/route.ts';

describe('parseHash', () => {
  it('reads the screens that have an address', () => {
    expect(parseHash('#/kantone')).toEqual({ name: 'cantons', canton: null });
    expect(parseHash('#/kantone/GR')).toEqual({ name: 'cantons', canton: 'GR' });
    expect(parseHash('#/haushalt')).toEqual({ name: 'household' });
  });

  it('takes a canton however it was typed', () => {
    expect(parseHash('#/kantone/gr')).toEqual({ name: 'cantons', canton: 'GR' });
    expect(parseHash('#kantone/gr')).toEqual({ name: 'cantons', canton: 'GR' });
    expect(parseHash('#/kantone/GR/')).toEqual({ name: 'cantons', canton: 'GR' });
  });

  it('lands on the plan rather than nowhere', () => {
    expect(parseHash('')).toEqual(PLAN);
    expect(parseHash('#')).toEqual(PLAN);
    expect(parseHash('#/')).toEqual(PLAN);
    expect(parseHash('#/gibtsnicht')).toEqual(PLAN);
  });

  it('ignores a canton that does not exist', () => {
    // A link with a typo still opens the list, just without a canton.
    expect(parseHash('#/kantone/XX')).toEqual({ name: 'cantons', canton: null });
    expect(parseHash('#/kantone/graubünden')).toEqual({ name: 'cantons', canton: null });
  });
});

describe('routeHash', () => {
  it('writes an address for every screen', () => {
    expect(routeHash(PLAN)).toBe('#/');
    expect(routeHash({ name: 'household' })).toBe('#/haushalt');
    expect(routeHash({ name: 'cantons', canton: null })).toBe('#/kantone');
    expect(routeHash({ name: 'cantons', canton: 'TI' })).toBe('#/kantone/TI');
  });

  it('round-trips, which is what makes a link worth sending', () => {
    for (const route of [PLAN, { name: 'household' } as const,
      { name: 'cantons', canton: null } as const, { name: 'cantons', canton: 'VS' } as const]) {
      expect(parseHash(routeHash(route))).toEqual(route);
    }
  });
});

describe('sameRoute', () => {
  it('compares what the address bar would show', () => {
    expect(sameRoute({ name: 'cantons', canton: 'GR' }, { name: 'cantons', canton: 'GR' })).toBe(true);
    expect(sameRoute({ name: 'cantons', canton: 'GR' }, { name: 'cantons', canton: null })).toBe(false);
    expect(sameRoute(PLAN, { name: 'household' })).toBe(false);
  });
});
