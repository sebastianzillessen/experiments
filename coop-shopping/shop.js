import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = path.join(__dirname, 'coop-profile');
const BASE_URL = 'https://www.coop.ch/de';
const SEARCH_URL = (q) => `https://www.coop.ch/de/search/?text=${encodeURIComponent(q)}`;
const CART_URL = 'https://www.coop.ch/de/cart';

function parseArgs(argv) {
  const items = [];
  for (const raw of argv.slice(2)) {
    if (!raw || raw.startsWith('--')) continue;
    const [name, qtyStr] = raw.split(':');
    const qty = Math.max(1, parseInt(qtyStr ?? '1', 10) || 1);
    items.push({ query: name.trim(), qty });
  }
  return items;
}

function waitForEnter(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, () => { rl.close(); resolve(); });
  });
}

async function acceptCookies(page) {
  const candidates = [
    '#onetrust-accept-btn-handler',
    'button:has-text("Alle akzeptieren")',
    'button:has-text("Akzeptieren")',
    'button:has-text("Accept all")',
    'button:has-text("Accept")',
  ];
  for (const sel of candidates) {
    const btn = page.locator(sel).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click().catch(() => {});
      await page.waitForTimeout(300);
      return true;
    }
  }
  return false;
}

async function isLoggedIn(page) {
  // Heuristik: Logout-Link oder "Mein Konto" sichtbar.
  const markers = [
    'a[href*="logout" i]',
    'a:has-text("Abmelden")',
    'a:has-text("Mein Konto")',
    '[data-testid*="account" i]',
  ];
  for (const sel of markers) {
    if (await page.locator(sel).first().isVisible().catch(() => false)) return true;
  }
  return false;
}

async function addOneToCart(page, query) {
  await page.goto(SEARCH_URL(query), { waitUntil: 'domcontentloaded' });
  await acceptCookies(page);

  // Erstes Produkt mit Add-to-Cart-Button finden.
  const addButton = page.locator([
    'button:has-text("In den Warenkorb")',
    'button[aria-label*="Warenkorb" i]',
    'button[data-testid*="add-to-cart" i]',
    'button:has(svg[aria-label*="Warenkorb" i])',
  ].join(', ')).first();

  await addButton.waitFor({ state: 'visible', timeout: 15000 });

  const cartBadge = page.locator('[data-testid*="cart-count" i], [aria-label*="Warenkorb" i] >> text=/\\d+/').first();
  const before = (await cartBadge.textContent().catch(() => null))?.trim() ?? null;

  await addButton.click();

  // Auf Bestätigung warten: entweder Badge ändert sich oder ein Toast erscheint.
  await Promise.race([
    page.waitForTimeout(1500),
    page.locator('text=/hinzugefügt|added/i').first().waitFor({ timeout: 4000 }).catch(() => {}),
    cartBadge.waitFor({ state: 'visible', timeout: 4000 }).catch(() => {}),
  ]);
  const after = (await cartBadge.textContent().catch(() => null))?.trim() ?? null;
  return { before, after };
}

async function shopItem(page, { query, qty }) {
  console.log(`\n→ "${query}" × ${qty}`);
  let added = 0;
  for (let i = 0; i < qty; i++) {
    try {
      const r = await addOneToCart(page, query);
      added++;
      console.log(`   ✓ ${i + 1}/${qty} hinzugefügt${r.after ? ` (Korb: ${r.after})` : ''}`);
    } catch (e) {
      console.log(`   ✗ ${i + 1}/${qty} fehlgeschlagen: ${e.message.split('\n')[0]}`);
      break;
    }
  }
  return added;
}

async function main() {
  const items = parseArgs(process.argv);
  if (items.length === 0) {
    console.log('Usage: npm start -- "Milch:2" "Brot" "Bananen:3"');
    console.log('Format: "Suchbegriff:Menge" (Menge optional, default 1)');
    process.exit(1);
  }

  console.log('Einkaufsliste:');
  for (const it of items) console.log(`  • ${it.query} × ${it.qty}`);

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 900 },
    locale: 'de-CH',
  });
  const page = context.pages()[0] ?? await context.newPage();

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await acceptCookies(page);

  if (!(await isLoggedIn(page))) {
    console.log('\n⚠  Nicht eingeloggt. Bitte im Browser einloggen (inkl. 2FA falls nötig).');
    console.log('   Die Session wird in ./coop-profile gespeichert und beim nächsten Lauf wiederverwendet.');
    await waitForEnter('   Wenn du eingeloggt bist, drücke ENTER hier im Terminal… ');
  } else {
    console.log('✓ Eingeloggt (persistente Session).');
  }

  const summary = [];
  for (const item of items) {
    const added = await shopItem(page, item);
    summary.push({ ...item, added });
  }

  await page.goto(CART_URL, { waitUntil: 'domcontentloaded' }).catch(() => {});

  console.log('\n──── Zusammenfassung ────');
  for (const s of summary) {
    const ok = s.added === s.qty ? '✓' : s.added === 0 ? '✗' : '~';
    console.log(`  ${ok} ${s.query}: ${s.added}/${s.qty}`);
  }
  console.log('\nWarenkorb ist offen. Prüfe die Produkte und schliesse manuell ab.');
  console.log('Browser bleibt offen — schliesse ihn, wenn du fertig bist (oder Strg+C).');

  await waitForEnter('ENTER drücken, um den Browser zu schliessen… ');
  await context.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
