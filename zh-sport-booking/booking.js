// Helpers to paste into the Chrome devtools console (or run via
// browser_evaluate from browsermcp) once the booking form is open.
//
// Loaded with the profile via:  window.__profile = { ...yaml as JSON... }
//
// Selectors are TODO — fill in from recon/findings.md before 07:00.

const SELECTORS = {
  bookButton: "TODO",            // e.g. "button[data-testid='book-cta']"
  variantSelect: null,           // null if no variant picker
  fields: {
    // form key -> selector
    salutation:    "TODO",
    first_name:    "TODO",
    last_name:     "TODO",
    date_of_birth: "TODO",
    email:         "TODO",
    phone:         "TODO",
    street:        "TODO",
    zip:           "TODO",
    city:          "TODO",
    country:       "TODO",
    payment:       "TODO",
  },
  acceptTerms:  "TODO",          // checkbox
  submitButton: "TODO",
  confirmation: "TODO",          // element only present on success
};

function $(sel) {
  const el = document.querySelector(sel);
  if (!el) throw new Error(`missing selector: ${sel}`);
  return el;
}

function setValue(sel, value) {
  if (value == null || value === "") return;
  const el = $(sel);
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
              : el instanceof HTMLSelectElement   ? HTMLSelectElement.prototype
              :                                     HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
  setter.call(el, value);
  el.dispatchEvent(new Event("input",  { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function check(sel, on = true) {
  const el = $(sel);
  if (el.checked !== on) el.click();
}

async function waitFor(sel, { timeout = 30_000, interval = 50, enabled = false } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const el = document.querySelector(sel);
    if (el && (!enabled || (!el.disabled && !el.getAttribute("aria-disabled")))) return el;
    await new Promise(r => setTimeout(r, interval));
  }
  throw new Error(`timeout waiting for ${sel}`);
}

// ---- 07:00 strike sequence -------------------------------------------------

async function strike() {
  const p = window.__profile;
  if (!p) throw new Error("window.__profile not loaded");

  // 1. Wait for the booking button to become enabled.
  const btn = await waitFor(SELECTORS.bookButton, { timeout: 120_000, enabled: true });
  btn.click();

  // 2. Pick variant if needed.
  if (SELECTORS.variantSelect && p.course.variant_label) {
    await waitFor(SELECTORS.variantSelect);
    const sel = $(SELECTORS.variantSelect);
    const opt = [...sel.options].find(o => o.text.trim() === p.course.variant_label);
    if (!opt) throw new Error(`variant not found: ${p.course.variant_label}`);
    setValue(SELECTORS.variantSelect, opt.value);
  }

  // 3. Fill the form.
  await waitFor(SELECTORS.fields.first_name);
  setValue(SELECTORS.fields.salutation,    p.person.salutation);
  setValue(SELECTORS.fields.first_name,    p.person.first_name);
  setValue(SELECTORS.fields.last_name,     p.person.last_name);
  setValue(SELECTORS.fields.date_of_birth, p.person.date_of_birth);
  setValue(SELECTORS.fields.email,         p.person.email);
  setValue(SELECTORS.fields.phone,         p.person.phone);
  setValue(SELECTORS.fields.street,        p.person.street);
  setValue(SELECTORS.fields.zip,           p.person.zip);
  setValue(SELECTORS.fields.city,          p.person.city);
  setValue(SELECTORS.fields.country,       p.person.country);
  setValue(SELECTORS.fields.payment,       p.payment.method);

  // 4. T&C and submit.
  if (SELECTORS.acceptTerms !== "TODO") check(SELECTORS.acceptTerms, true);
  $(SELECTORS.submitButton).click();

  // 5. Verify success.
  await waitFor(SELECTORS.confirmation, { timeout: 60_000 });
  console.log("BOOKING CONFIRMED");
}

// Expose for manual call:
window.__strike = strike;
window.__SELECTORS = SELECTORS;
