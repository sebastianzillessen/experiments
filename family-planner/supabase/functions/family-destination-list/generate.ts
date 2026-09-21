// Asking Claude for a list of places.
//
// Same shape as the trip ideas: official SDK, structured outputs, the model as
// the only source. Nothing here is written to the database — the answer goes
// back to the screen, and the family decides what of it becomes a list.

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { MAX_ITEMS, buildPrompt, validateList } from './list.ts';
import type { GeneratedList } from './list.ts';

const MODEL = 'claude-opus-5';

const ListSchema = z.object({
  group: z.string().describe('Kurzer Name für die Liste, als Überschrift'),
  items: z.array(z.object({
    name: z.string().describe('Der Ort, auf Deutsch'),
    code: z.string().describe('Übliches Kürzel, 1–4 Zeichen, oder leer'),
  })).describe(`Höchstens ${MAX_ITEMS} Einträge`),
  note: z.string().describe('Ein Satz, wenn es etwas zu sagen gibt, sonst leer'),
});

export async function generateList(request: string, apiKey: string): Promise<GeneratedList> {
  // Lists are asked for once and looked at, so an overloaded minute should not
  // become a shrug; the SDK backs off between tries.
  const client = new Anthropic({ apiKey, maxRetries: 4 });

  let response;
  try {
    response = await client.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      messages: [{ role: 'user', content: buildPrompt(request) }],
      output_config: { format: zodOutputFormat(ListSchema) },
    });
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      throw new Error(apiErrorMessage(e.status));
    }
    throw e;
  }

  if (response.stop_reason === 'refusal') {
    throw new Error('Zu dieser Beschreibung kam keine Liste zurück');
  }
  return validateList(response.parsed_output, request);
}

function apiErrorMessage(status: number | undefined): string {
  if (status === 429) return 'Claude ist gerade ausgelastet. Bitte in ein paar Minuten nochmal.';
  if (status === 529 || (status !== undefined && status >= 500)) {
    return 'Claude ist gerade überlastet. Bitte gleich nochmal versuchen.';
  }
  if (status === 401 || status === 403) return 'Der Schlüssel für Claude wird nicht akzeptiert.';
  return 'Die Liste konnte nicht erzeugt werden';
}
