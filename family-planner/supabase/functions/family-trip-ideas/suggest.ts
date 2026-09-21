// Asking Claude for the ideas.
//
// Structured outputs pin the shape; ideas.ts then decides what is kept. The
// model is the only source here — no web search — so the prompt leans hard on
// "leave it out if you are not sure", and the screen says the details want
// checking before anyone drives.

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { MAX_IDEAS, buildPrompt, validateIdeas } from './ideas.ts';
import type { TripIdea } from './ideas.ts';

const MODEL = 'claude-opus-5';

const IdeasSchema = z.object({
  ideas: z.array(z.object({
    title: z.string().describe('Der Ort oder die Sache, kurz und konkret'),
    summary: z.string().describe('Zwei Sätze, was man dort mit Kindern macht'),
    highlights: z.array(z.string()).describe('Zwei bis drei konkrete Dinge vor Ort'),
    duration: z.enum(['tag', 'zwei-tage']),
    season: z.string().describe('Wann es sich lohnt, in wenigen Worten'),
    travel: z.string().describe('Wie man hinkommt, in wenigen Worten'),
  })).describe(`Höchstens ${MAX_IDEAS} Vorschläge`),
});

export async function suggestTrips(
  cantonName: string, wishes: string, plz: string | null, apiKey: string
): Promise<TripIdea[]> {
  const client = new Anthropic({ apiKey });

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    messages: [{ role: 'user', content: buildPrompt(cantonName, wishes, plz) }],
    output_config: { format: zodOutputFormat(IdeasSchema) },
  });

  if (response.stop_reason === 'refusal') {
    throw new Error('Für diesen Kanton kamen keine Vorschläge zurück');
  }
  return validateIdeas(response.parsed_output);
}
