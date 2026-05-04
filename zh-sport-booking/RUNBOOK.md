# Mountainbike booking runbook

Course: https://www.stadt-zuerich.ch/sport-portal/angebot/27212/Mountainbike
Registration opens: **2026-05-05 07:00 Europe/Zurich**

We drive Chrome through `browsermcp`. The plan is:

1. **Tonight (recon)** — capture every selector we can see *before* login is open.
2. **06:50 tomorrow** — warm-up: log in, navigate to course page.
3. **06:59:50 tomorrow** — poll the "Anmelden" button.
4. **07:00:00** — click, fill form from `profile.yaml`, submit, confirm.

---

## Step 0 — One-time setup

```bash
cd zh-sport-booking
cp profile.example.yaml profile.yaml
$EDITOR profile.yaml   # fill in everything you know
```

Confirm browsermcp is reachable from Claude: ask Claude to call the
`browser_navigate` (or equivalent) tool against `https://example.com`.

---

## Step 1 — Recon pass (do tonight)

Goal: produce `recon/findings.md` with the exact selectors and the post-click
flow. Without login the booking form may be hidden, but the *path to it* is not.

In a Claude session with browsermcp, run through this checklist:

1. Navigate to the course URL.
2. Snapshot the page (`browser_snapshot` or `browser_get_page`). Save HTML to
   `recon/course-page.html` and a screenshot to `recon/course-page.png`.
3. Locate the booking CTA. Likely German labels: **Anmelden**, **Buchen**,
   **In den Warenkorb**, **Reservieren**. Record:
   - visible text
   - tag, id, class, `data-*` attributes
   - whether it is enabled or disabled (greyed out before 7am?)
   - the link target / form action if present
4. Find the customer login link (top-right, header). Record URL and the
   selectors of the username/password fields on the login page.
5. Try clicking the booking CTA without being logged in. Note exactly what
   happens — redirect to login? modal? error toast?
6. If a course-variant dropdown / date picker appears, list every option.
7. Open Chrome DevTools → Network and click the booking CTA again. Note any
   XHR/fetch endpoints (e.g. `/api/booking/...`). If the booking is just a
   POST, we may be able to skip the UI entirely tomorrow.
8. Inspect the page source for framework hints (`__NEXT_DATA__`, Angular
   `ng-*` attrs, etc.) — affects whether we can rely on stable DOM IDs.

Write findings into `recon/findings.md` using the template below.

---

## Step 2 — Warm-up at 06:50

Open one Chrome window via browsermcp. In order:

1. `browser_navigate` → `login.url` from profile.yaml
2. Type username, password, submit. Verify logged-in (header shows name).
3. `browser_navigate` → `course.url`. **Stay on this tab. Do not close it.**
4. Disable any browser auto-refresh. Leave network tab open if helpful.

---

## Step 3 — Strike at 07:00

Two strategies, pick whichever matches what recon revealed:

### A. UI path (default — works without knowing the API)

```
loop until 07:00:00:
    reload page
    if booking_button is enabled:
        click it
        break
fill form from profile.yaml
click submit
screenshot the confirmation
```

Concrete tool calls (pseudo, names depend on your browsermcp build):
- `browser_evaluate` → JS that checks `document.querySelector(SELECTOR).disabled`
- `browser_click` → booking CTA
- `browser_fill` per field
- `browser_click` → final submit

### B. API path (only if recon found a clean POST endpoint)

Replay the booking POST with `fetch` from the page console (so the session
cookie comes for free). Faster than UI by ~1–2 seconds.

```js
await fetch("/api/...", {
  method: "POST",
  headers: { "Content-Type": "application/json", /* CSRF if needed */ },
  body: JSON.stringify({ /* payload from recon */ })
}).then(r => r.json())
```

---

## Step 4 — Confirm

- Screenshot the success page.
- Save the booking confirmation email / order ID to `recon/confirmation.txt`.
- If it failed: don't refresh blindly. Check the error, fix, retry.

---

## Failure modes to expect

- **503 / queue page**: the portal puts you in a waiting room. Don't reload —
  reloading drops your queue position. Wait it out.
- **Captcha**: human takes over. Keep the window visible.
- **Session expired during warm-up**: re-login is fine; the course page tab
  doesn't hold session, the cookie does.
- **Course already full at 07:00:01**: nothing we can do. Have a backup
  course URL ready in profile.yaml `extras.fallback_url`.
