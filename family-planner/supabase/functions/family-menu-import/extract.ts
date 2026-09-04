// Reading one scanned menu page with Claude.
//
// The PDF goes over as a document block; the API renders the page and the
// model reads it. Structured outputs pin the shape of the answer, and
// validateMenuWeek() then checks that the shape actually describes the week we
// asked for — the schema cannot tell a right date from a wrong one.

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { schoolDays, validateMenuWeek } from './menu.ts';
import type { MenuWeek } from './menu.ts';

const MODEL = 'claude-opus-5';

const MenuSchema = z.object({
  days: z.array(z.object({
    date: z.string().describe('The date printed in that row, as yyyy-mm-dd'),
    dishes: z.array(z.object({
      name: z.string().describe('The dish exactly as printed'),
      tags: z.array(z.enum(['gluten-free', 'lactose-free', 'seasonal'])),
    })),
  })),
});

/**
 * What the model is told. Two things it must get right and one it must not do:
 * copy Swiss spellings as printed, map the three legend symbols — and leave a
 * dish out rather than guess at it. A plausible invented dish is the failure
 * nobody catches, so it is cheaper to show a gap.
 */
function instructions(year: number, week: number): string {
  const days = schoolDays(year, week);
  return [
    'This is a scan of a weekly school lunch menu from a school in Zurich, in German.',
    `It covers calendar week ${week} of ${year}: ${days.join(', ')}.`,
    '',
    'Read one entry per weekday row from the "Mittagessen" column.',
    '',
    'Copy every dish name EXACTLY as printed. It is Swiss German and Swiss',
    'orthography: keep "Erbsli", "Rüebli", "Brötli", "ss" where the page has',
    '"ss", and keep bracketed markers such as "(R)", "(ASC)", "(Vegi)".',
    'Do not translate, do not correct spelling, do not tidy the wording.',
    '',
    'The legend at the foot of the page maps three symbols:',
    '  crossed circle  -> lactose-free',
    '  slashed square  -> gluten-free',
    '  small triangle  -> seasonal',
    'Attach them to the dish on whose line they appear. A line with no symbol',
    'gets an empty list.',
    '',
    'If a word is smudged or you cannot read it with confidence, leave that',
    'dish out. A missing dish is fine; an invented one is not. Ignore the',
    '"Herkunft" and "Legende" blocks — they are not dishes.',
  ].join('\n');
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export async function extractMenuWeek(
  pdf: Uint8Array, year: number, week: number, apiKey: string
): Promise<MenuWeek> {
  const client = new Anthropic({ apiKey });

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: toBase64(pdf) },
        },
        { type: 'text', text: instructions(year, week) },
      ],
    }],
    output_config: { format: zodOutputFormat(MenuSchema) },
  });

  if (response.stop_reason === 'refusal') {
    throw new Error('Der Menüplan konnte nicht gelesen werden');
  }
  return validateMenuWeek(response.parsed_output, year, week);
}
