import { describe, expect, it } from 'vitest';
import { functionErrorMessage } from '../src/lib/functionError.ts';

/** What supabase-js hands back for a non-2xx from an Edge Function. */
const httpError = (status: number, body: string, contentType = 'application/json') => ({
  name: 'FunctionsHttpError',
  message: 'Edge Function returned a non-2xx status code',
  context: new Response(body, { status, headers: { 'Content-Type': contentType } }),
});

describe('functionErrorMessage', () => {
  it('prefers what the function itself said', async () => {
    const error = httpError(500, JSON.stringify({ error: 'Ideen sind nicht konfiguriert' }));
    expect(await functionErrorMessage(error, 'egal')).toBe('Ideen sind nicht konfiguriert');
  });

  it('reads a plain-text body when there is no JSON', async () => {
    const error = httpError(502, 'Bad Gateway', 'text/plain');
    expect(await functionErrorMessage(error, 'egal')).toBe('Bad Gateway');
  });

  it('falls back to the error\'s own message when the body says nothing', async () => {
    const error = httpError(500, JSON.stringify({ something: 'else' }));
    expect(await functionErrorMessage(error, 'egal'))
      .toBe('Edge Function returned a non-2xx status code');
  });

  it('uses the fallback when there is nothing else at all', async () => {
    expect(await functionErrorMessage({}, 'Die Ideen konnten nicht geholt werden'))
      .toBe('Die Ideen konnten nicht geholt werden');
    expect(await functionErrorMessage(null, 'Fallback')).toBe('Fallback');
  });

  it('leaves the response readable for anyone else looking at it', async () => {
    const error = httpError(400, JSON.stringify({ error: 'Diesen Kanton gibt es nicht' }));
    await functionErrorMessage(error, 'egal');
    // The body was cloned, not consumed — a second read still works.
    expect(await error.context.json()).toEqual({ error: 'Diesen Kanton gibt es nicht' });
  });

  it('keeps a runaway message to a readable length', async () => {
    const error = httpError(500, JSON.stringify({ error: 'x'.repeat(900) }));
    expect((await functionErrorMessage(error, 'egal')).length).toBe(300);
  });

  it('also reads an error handed over as a plain object', async () => {
    expect(await functionErrorMessage({ context: { error: 'Forbidden' } }, 'egal')).toBe('Forbidden');
  });
});
