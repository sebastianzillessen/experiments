# Recon findings — copy to findings.md and fill in

## Course page

- URL: https://www.stadt-zuerich.ch/sport-portal/angebot/27212/Mountainbike
- Reachable without login? (yes/no)
- Frontend framework hints (Next.js `__NEXT_DATA__`, Angular, custom):

### Booking CTA

- Visible label: ____
- Selector: ____
- Outer HTML:
  ```html
  ```
- Disabled before 7am? (yes/no, how is it indicated)
- Click target: same page modal / new page URL / form POST to ____

### Course variants / dates

- Selector of the variant control: ____
- Options:
  - [ ] ____
  - [ ] ____

## Login

- Login URL: ____
- Username field selector: ____
- Password field selector: ____
- Submit button selector: ____
- After login redirect URL: ____
- Logged-in indicator (so the script can verify): ____

## Booking form (post-CTA)

For each field record: label, selector, type (text/select/checkbox), required.

| Label | Selector | Type | Required | Profile key |
|-------|----------|------|----------|-------------|
|       |          |      |          |             |

### Submit

- Final "Buchen / Bestätigen" button selector: ____
- Confirmation indicator (URL / DOM element / success text): ____

## Network observations

- Any XHR endpoint that performs the actual booking? Method + path:
- CSRF token location (cookie name / meta tag / hidden input):
- Session cookie name(s):

## Quirks

- Queue / waiting room behaviour:
- Captcha?
- Rate-limit observations:
