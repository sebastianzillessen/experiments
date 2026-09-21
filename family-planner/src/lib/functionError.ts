// Getting the Edge Function's own words out of supabase-js.
//
// `functions.invoke` turns any non-2xx into a FunctionsHttpError whose message
// is "Edge Function returned a non-2xx status code" — true, and useless. The
// function's own body says what actually went wrong ("CLAUDE_API_KEY fehlt",
// "Nur Owner und Bearbeiter dürfen Ideen holen"), and it is sitting right
// there on the error as the untouched Response.

const MAX = 300;

function fromBody(body: unknown): string | null {
  const message = (body as { error?: unknown; message?: unknown })?.error
    ?? (body as { message?: unknown })?.message;
  return typeof message === 'string' && message.trim() ? message.trim().slice(0, MAX) : null;
}

/**
 * The most specific message available, in this order: the JSON `error` the
 * function sent, its plain-text body, the error's own message, the fallback.
 */
export async function functionErrorMessage(error: unknown, fallback: string): Promise<string> {
  const context = (error as { context?: unknown })?.context;

  if (typeof Response !== 'undefined' && context instanceof Response) {
    let wasJson = false;
    try {
      const parsed = await context.clone().json();
      wasJson = true;
      const fromJson = fromBody(parsed);
      if (fromJson) return fromJson;
    } catch { /* not JSON — worth trying as text */ }
    // Only when it was not JSON: showing someone a raw {"something":"else"}
    // is worse than the generic message it would replace.
    if (!wasJson) {
      try {
        const text = (await context.clone().text()).trim();
        if (text) return text.slice(0, MAX);
      } catch { /* nothing readable left */ }
    }
  } else if (context && typeof context === 'object') {
    const direct = fromBody(context);
    if (direct) return direct;
  }

  const own = (error as { message?: unknown })?.message;
  return typeof own === 'string' && own.trim() ? own.trim().slice(0, MAX) : fallback;
}
