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
  const flags = { dryRun: false, headless: false, max: 5, interactive: true };
  for (const raw of argv.slice(2)) {
    if (!raw) continue;
    if (raw === '--dry-run') { flags.dryRun = true; continue; }
    if (raw === '--headless') { flags.headless = true; continue; }
    if (raw === '--no-interactive' || raw === '--yes') { flags.interactive = false; continue; }
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

async function searchProducts(page, query, max) {
  await page.goto(SEARCH_URL(query), { waitUntil: 'domcontentloaded' });
  await acceptCookies(page);
  try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch {}
  try { await page.waitForSelector('a[href*="/p/"]', { timeout: 8000 }); } catch {}
  return extractProducts(page, max);
}

function promptInput(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, (ans) => { rl.close(); resolve(ans); });
  });
}

const waitForEnter = (msg) => promptInput(msg);

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

function absoluteUrl(href) {
  if (!href) return null;
  if (href.startsWith('http')) return href;
  if (href.startsWith('/')) return `https://www.coop.ch${href}`;
  return `https://www.coop.ch/${href}`;
}

async function addToCartFromProductPage(page, productUrl, qty) {
  await page.goto(absoluteUrl(productUrl), { waitUntil: 'domcontentloaded' });
  await acceptCookies(page);

  const addButton = page.locator([
    'button:has-text("In den Warenkorb")',
    'button[aria-label*="Warenkorb" i]',
    'button[data-testid*="add-to-cart" i]',
    'button:has(svg[aria-label*="Warenkorb" i])',
  ].join(', ')).first();
  await addButton.waitFor({ state: 'visible', timeout: 15000 });

  let added = 0;
  for (let i = 0; i < qty; i++) {
    try {
      await addButton.click();
      await Promise.race([
        page.locator('text=/hinzugefügt|added/i').first().waitFor({ timeout: 3000 }).catch(() => {}),
        page.waitForTimeout(700),
      ]);
      added++;
    } catch (e) {
      console.log(`     ✗ Klick ${i + 1} fehlgeschlagen: ${e.message.split('\n')[0]}`);
      break;
    }
  }
  return added;
}

function renderCandidates(candidates) {
  candidates.forEach((p, i) => {
    const price = p.price ? `CHF ${p.price}` : '   ?  ';
    console.log(`   ${i + 1}. ${p.name.padEnd(60)} ${price.padStart(10)}`);
  });
}

async function chooseProduct(candidates, interactive) {
  renderCandidates(candidates);
  if (!interactive) {
    console.log(`   → automatisch: 1`);
    return candidates[0];
  }
  const ans = (await promptInput(`   Auswahl 1-${candidates.length}, [s]kip, [ENTER]=1: `)).trim();
  if (ans.toLowerCase() === 's' || ans.toLowerCase() === 'skip') return null;
  if (ans === '') return candidates[0];
  const n = parseInt(ans, 10);
  if (Number.isFinite(n) && n >= 1 && n <= candidates.length) return candidates[n - 1];
  console.log(`   (ungültige Eingabe "${ans}", nehme 1)`);
  return candidates[0];
}

async function main() {
  const { items, flags } = parseArgs(process.argv);
  if (items.length === 0) {
    console.log('Usage:');
    console.log('  npm start -- "Milch:2" "Brot" "Bananen:3"           (interaktive Auswahl, dann Warenkorb)');
    console.log('  npm start -- --no-interactive "Milch:2" "Brot"      (immer erstes Suchergebnis, kein Prompt)');
    console.log('  npm start -- --dry-run "Milch" "Brot"               (nur listen, kein Login nötig)');
    console.log('  Flags: --dry-run, --no-interactive, --headless, --max=N');
    process.exit(1);
  }

  console.log(flags.dryRun ? `Dry-Run (Top ${flags.max} pro Suchbegriff):` : 'Einkaufsliste:');
  for (const it of items) console.log(`  • ${it.query}${flags.dryRun ? '' : ` × ${it.qty}`}`);

  if (flags.dryRun) {
    const browser = await chromium.launch({ headless: flags.headless || true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'de-CH', ignoreHTTPSErrors: true });
    const page = await context.newPage();
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await acceptCookies(page);
    for (const item of items) {
      console.log(`\n→ "${item.query}"`);
      try {
        const products = await searchProducts(page, item.query, flags.max);
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
    ignoreHTTPSErrors: true,
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

  console.log('\n──── Auswahl ────');
  const picks = [];
  for (const item of items) {
    console.log(`\n→ "${item.query}" × ${item.qty}`);
    let candidates = [];
    try {
      candidates = await searchProducts(page, item.query, flags.max);
    } catch (e) {
      console.log(`   ✗ Suche fehlgeschlagen: ${e.message.split('\n')[0]}`);
      continue;
    }
    if (candidates.length === 0) {
      console.log('   (keine Treffer)');
      continue;
    }
    const chosen = await chooseProduct(candidates, flags.interactive);
    if (!chosen) { console.log('   übersprungen.'); continue; }
    picks.push({ ...item, productUrl: chosen.url, productName: chosen.name, price: chosen.price });
  }

  if (picks.length === 0) {
    console.log('\nKeine Produkte ausgewählt. Beende.');
    await context.close();
    return;
  }

  console.log('\n──── Auswahl-Zusammenfassung ────');
  for (const p of picks) {
    const price = p.price ? `CHF ${p.price}` : '?';
    console.log(`  • ${p.productName} × ${p.qty} (${price})`);
  }
  if (flags.interactive) {
    const ok = (await promptInput('\nIn den Warenkorb legen? [ENTER]=ja, [n]=abbrechen: ')).trim().toLowerCase();
    if (ok === 'n' || ok === 'no' || ok === 'nein') {
      console.log('Abgebrochen.');
      await context.close();
      return;
    }
  }

  console.log('\n──── In den Warenkorb ────');
  const summary = [];
  for (const p of picks) {
    console.log(`\n→ ${p.productName} × ${p.qty}`);
    let added = 0;
    try {
      added = await addToCartFromProductPage(page, p.productUrl, p.qty);
    } catch (e) {
      console.log(`   ✗ ${e.message.split('\n')[0]}`);
    }
    const ok = added === p.qty ? '✓' : added === 0 ? '✗' : '~';
    console.log(`   ${ok} ${added}/${p.qty} hinzugefügt`);
    summary.push({ ...p, added });
  }

  await page.goto(CART_URL, { waitUntil: 'domcontentloaded' }).catch(() => {});

  console.log('\n──── Endergebnis ────');
  for (const s of summary) {
    const ok = s.added === s.qty ? '✓' : s.added === 0 ? '✗' : '~';
    console.log(`  ${ok} ${s.productName}: ${s.added}/${s.qty}`);
  }
  console.log('\nWarenkorb ist offen. Prüfe die Produkte und schliesse manuell ab.');

  await waitForEnter('ENTER drücken, um den Browser zu schliessen… ');
  await context.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
