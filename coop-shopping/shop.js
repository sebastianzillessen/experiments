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
  const flags = { dryRun: false, headless: false, max: 5 };
  for (const raw of argv.slice(2)) {
    if (!raw) continue;
    if (raw === '--dry-run') { flags.dryRun = true; continue; }
    if (raw === '--headless') { flags.headless = true; continue; }
    if (raw.startsWith('--max=')) { flags.max = Math.max(1, parseInt(raw.slice(6), 10) || 5); continue; }
    if (raw.startsWith('--')) continue;
    const [name, qtyStr] = raw.split(':');
    const qty = Math.max(1, parseInt(qtyStr ?? '1', 10) || 1);
    items.push({ query: name.trim(), qty });
  }
  return { items, flags };
}

async function extractProducts(page, max) {
  return page.evaluate((max) => {
    const seen = new Set();
    const out = [];
    const priceRe = /(?:CHF|Fr\.?|chf)\s*([0-9]+[.,][0-9]{2})|([0-9]+[.,][0-9]{2})\s*(?:CHF|Fr\.?)/i;
    const links = document.querySelectorAll('a[href*="/p/"]');
    for (const a of links) {
      const href = a.getAttribute('href') || '';
      if (!href || seen.has(href)) continue;
      const card = a.closest('article, li, [class*="product" i], [data-testid*="product" i]') || a.parentElement;
      if (!card) continue;
      const text = (card.innerText || '').replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const priceMatch = text.match(priceRe);
      const price = priceMatch ? (priceMatch[1] || priceMatch[2]).replace(',', '.') : null;
      const name = (a.getAttribute('aria-label') || a.innerText || text.split('CHF')[0]).replace(/\s+/g, ' ').trim().slice(0, 90);
      if (!name) continue;
      seen.add(href);
      out.push({ name, price, url: href });
      if (out.length >= max) break;
    }
    return out;
  }, max);
}

async function dryRunQuery(page, query, max) {
  await page.goto(SEARCH_URL(query), { waitUntil: 'domcontentloaded' });
  await acceptCookies(page);
  try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch {}
  try { await page.waitForSelector('a[href*="/p/"]', { timeout: 8000 }); } catch {}
  return extractProducts(page, max);
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
  const { items, flags } = parseArgs(process.argv);
  if (items.length === 0) {
    console.log('Usage:');
    console.log('  npm start -- "Milch:2" "Brot" "Bananen:3"           (Warenkorb füllen, braucht Login)');
    console.log('  npm start -- --dry-run "Milch" "Brot"               (nur listen, kein Login nötig)');
    console.log('  Flags: --dry-run, --headless, --max=N');
    process.exit(1);
  }

  console.log(flags.dryRun ? `Dry-Run (Top ${flags.max} pro Suchbegriff):` : 'Einkaufsliste:');
  for (const it of items) console.log(`  • ${it.query}${flags.dryRun ? '' : ` × ${it.qty}`}`);

  if (flags.dryRun) {
    const browser = await chromium.launch({ headless: flags.headless || true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'de-CH' });
    const page = await context.newPage();
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await acceptCookies(page);
    for (const item of items) {
      console.log(`\n→ "${item.query}"`);
      try {
        const products = await dryRunQuery(page, item.query, flags.max);
        if (products.length === 0) {
          console.log('   (keine Produkte gefunden — Selektoren prüfen oder Bot-Block?)');
        } else {
          products.forEach((p, i) => {
            const price = p.price ? `CHF ${p.price}` : '   ?  ';
            console.log(`   ${i + 1}. ${p.name.padEnd(60)} ${price.padStart(10)}  ${p.url}`);
          });
        }
      } catch (e) {
        console.log(`   ✗ Fehler: ${e.message.split('\n')[0]}`);
      }
    }
    await context.close();
    await browser.close();
    return;
  }

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: flags.headless,
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
