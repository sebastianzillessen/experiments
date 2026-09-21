import { describe, expect, it } from 'vitest';
import { PLAN, parseHash, routeHash, sameRoute } from '../src/lib/route.ts';

describe('parseHash', () => {
  it('reads the screens that have an address', () => {
    expect(parseHash('#/ausfluege')).toEqual({ name: 'trips', destination: null });
    expect(parseHash('#/ausfluege/abc-123')).toEqual({ name: 'trips', destination: 'abc-123' });
    expect(parseHash('#/haushalt')).toEqual({ name: 'household' });
  });

  it('does not mind how the link was written', () => {
    expect(parseHash('#ausfluege/abc-123')).toEqual({ name: 'trips', destination: 'abc-123' });
    expect(parseHash('#/ausfluege/abc-123/')).toEqual({ name: 'trips', destination: 'abc-123' });
  });

  it('lands on the plan rather than nowhere', () => {
    expect(parseHash('')).toEqual(PLAN);
    expect(parseHash('#')).toEqual(PLAN);
    expect(parseHash('#/')).toEqual(PLAN);
    expect(parseHash('#/gibtsnicht')).toEqual(PLAN);
  });

  it('leaves it to the screen whether that destination still exists', () => {
    // A link to something deleted should open the list, not the plan — the
    // parser cannot know, so it passes the id through and the screen decides.
    expect(parseHash('#/ausfluege/weg')).toEqual({ name: 'trips', destination: 'weg' });
  });
});

describe('routeHash', () => {
  it('writes an address for every screen', () => {
    expect(routeHash(PLAN)).toBe('#/');
    expect(routeHash({ name: 'household' })).toBe('#/haushalt');
    expect(routeHash({ name: 'trips', destination: null })).toBe('#/ausfluege');
    expect(routeHash({ name: 'trips', destination: 'ti-1' })).toBe('#/ausfluege/ti-1');
  });

  it('round-trips, which is what makes a link worth sending', () => {
    for (const route of [PLAN, { name: 'household' } as const,
      { name: 'trips', destination: null } as const,
      { name: 'trips', destination: 'vs-1' } as const]) {
      expect(parseHash(routeHash(route))).toEqual(route);
    }
  });
});

describe('sameRoute', () => {
  it('compares what the address bar would show', () => {
    expect(sameRoute({ name: 'trips', destination: 'gr' }, { name: 'trips', destination: 'gr' })).toBe(true);
    expect(sameRoute({ name: 'trips', destination: 'gr' }, { name: 'trips', destination: null })).toBe(false);
    expect(sameRoute(PLAN, { name: 'household' })).toBe(false);
  });
});
