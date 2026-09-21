// Asking Claude for the ideas.
//
// Structured outputs pin the shape; ideas.ts then decides what is kept. The
// model is the only source here — no web search — so the prompt leans hard on
// "leave it out if you are not sure", and the screen says the details want
// checking before anyone drives.
//
// The request is deliberately the same shape as the menu importer's, down to
// leaving `thinking` unset: Opus 5 thinks adaptively on its own, so naming it
// bought nothing and was the only way this call differed from one already
// known to work.

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { MAX_IDEAS, apiErrorMessage, buildPrompt, validateIdeas } from './ideas.ts';
import type { TripIdea } from './ideas.ts';

const MODEL = 'claude-opus-5';

const IdeasSchema = z.object({
  ideas: z.array(z.object({
    title: z.string().describe('Der Ort oder die Sache, kurz und konkret'),
    summary: z.string().describe('Zwei Sätze, was man dort mit Kindern macht'),
    highlights: z.array(z.string()).describe('Zwei bis drei konkrete Dinge vor Ort'),
    duration: z.enum(['tag', 'zwei-tage']),
    season: z.string().describe('Wann es sich lohnt, in wenigen Worten'),
    travel: z.string().describe('Verkehrsmittel und ungefähre Fahrzeit ab dem Startort der Familie'),
  })).describe(`Höchstens ${MAX_IDEAS} Vorschläge`),
});

export async function suggestTrips(
  cantonName: string, wishes: string, origin: string | null, apiKey: string
): Promise<TripIdea[]> {
  // A few more goes than the default two: this is one deliberate tap by a
  // person waiting for it, and an overloaded minute should not become a
  // shrug. The SDK backs off between tries.
  const client = new Anthropic({ apiKey, maxRetries: 4 });

  let response;
  try {
    response = await client.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      messages: [{ role: 'user', content: buildPrompt(cantonName, wishes, origin) }],
      output_config: { format: zodOutputFormat(IdeasSchema) },
    });
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      throw new Error(apiErrorMessage(e.status, 'Die Ideen konnten nicht geholt werden'));
    }
    throw e;
  }

  if (response.stop_reason === 'refusal') {
    throw new Error('Für diesen Kanton kamen keine Vorschläge zurück');
  }
  return validateIdeas(response.parsed_output);
}
