# zh-sport-booking

Skeleton for booking a Stadt Zürich sport-portal course the moment
registration opens.

```
RUNBOOK.md              ← do this top-to-bottom on the day
profile.example.yaml    ← template; copy to profile.yaml (gitignored)
booking.js              ← form-fill + strike sequence (paste into devtools)
load-profile.js         ← profile.yaml → JSON for the browser
recon/findings.template.md  ← copy to findings.md while reconning
```

Status: **selectors not yet known.** Recon pass via browsermcp is required
to fill in the `TODO` fields in `booking.js`.

Why no fully-automated script yet: the booking form sits behind a customer
login that opens at 07:00 tomorrow, so we can't see its DOM until we either
(a) log in and click through tonight, or (b) wait until tomorrow. The
current scaffold lets us drop selectors in at the last minute.
