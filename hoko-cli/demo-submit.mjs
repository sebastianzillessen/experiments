#!/usr/bin/env node
// Fake guest registration → host email with meldeschein-<code>.xls attached.
// Lets you re-test the portal upload without filling the form by hand.
//
//   npm run hoko:demo
//   npm run hoko:demo -- --guests 5
//   npm run hoko:demo -- --url https://claude-hoko-airbnb-url-structure-vxq0p-experiments.sebastian-849.workers.dev/api/hoko/submit
//   npm run hoko:demo -- --code HMDEMO0001

const SAMPLE_GUESTS = [
  { firstname: "Hans",      lastname: "Müller",   country: "Switzerland",   countryIso: "CH", ausweisart: "Passport", ausweisnummer: "X1234567" },
  { firstname: "Anna-Lena", lastname: "O'Connor", country: "Ireland",       countryIso: "IE", ausweisart: "ID card",  ausweisnummer: "IE-998877" },
  { firstname: "Jürgen",    lastname: "Schmidt",  country: "Germany",       countryIso: "DE", ausweisart: "Passport", ausweisnummer: "C0ABCDEF1" },
  { firstname: "Sofia",     lastname: "García",   country: "Spain",         countryIso: "ES", ausweisart: "ID card",  ausweisnummer: "ESP-77216" },
  { firstname: "Marco",     lastname: "Rossi",    country: "Italy",         countryIso: "IT", ausweisart: "Passport", ausweisnummer: "YA8451293" },
];

// Crockford-style alphabet (no 0/O/1/I), matching the worker's auto-code.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function generateTestCode() {
  let suffix = "";
  for (let i = 0; i < 4; i++) suffix += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return `TEST-${suffix}`;
}

const DEFAULTS = {
  url: "https://hoko.zillessen.dev/api/hoko/submit",
  guests: 2,
  ankunft: "10.07.2026",
  abreise: "13.07.2026",
  code: generateTestCode(), // TEST-XXXX prefix so test runs stand out in the inbox
};

function parseArgs(argv) {
  const out = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === "--url") { out.url = v; i++; }
    else if (k === "--guests") { out.guests = Math.max(1, Math.min(SAMPLE_GUESTS.length, parseInt(v, 10))); i++; }
    else if (k === "--code") { out.code = v; i++; }
    else if (k === "--ankunft") { out.ankunft = v; i++; }
    else if (k === "--abreise") { out.abreise = v; i++; }
    else if (k === "--help" || k === "-h") {
      console.log(`Usage: npm run hoko:demo -- [--url URL] [--guests N] [--code CODE] [--ankunft DD.MM.YYYY] [--abreise DD.MM.YYYY]`);
      process.exit(0);
    }
  }
  return out;
}

const opts = parseArgs(process.argv.slice(2));
const body = {
  code: opts.code,
  ankunft: opts.ankunft,
  abreise: opts.abreise,
  guests: SAMPLE_GUESTS.slice(0, opts.guests),
};

console.log(`POST ${opts.url}`);
console.log(`  ${opts.guests} guest(s), stay ${opts.ankunft} – ${opts.abreise}, code ${opts.code}`);

const resp = await fetch(opts.url, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
const text = await resp.text();

console.log(`\nHTTP ${resp.status}`);
console.log(text);

if (!resp.ok) process.exit(1);

let parsed;
try { parsed = JSON.parse(text); } catch { parsed = null; }
if (parsed && parsed.code) {
  console.log(`\n✓ Host email is on its way. Look for "New guest registration — code ${parsed.code}"`);
  console.log(`  Attachment: meldeschein-${parsed.code}.xls`);
}
