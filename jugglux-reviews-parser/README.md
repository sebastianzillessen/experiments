# Jugglux Reviews Parser

Scrapes **all product reviews** from [jugglux.ch](https://www.jugglux.ch/) by
traversing every page of the shop's review listing at
[`/alle-produkte-bewertungen`](https://www.jugglux.ch/alle-produkte-bewertungen)
(~132 pages, ~3,165 reviews at the time of writing).

For each review it extracts:

- `author` — reviewer name
- `date` / `date_raw` — ISO date parsed from the German date string
- `rating` — 0–5 stars (half stars supported)
- `title` and full review `text`
- `product_url`, `product_slug`, `image_url`

## Output

Written to `data/`:

| File | Content |
|------|---------|
| `reviews_all.json` / `.csv` | Full export of every review |
| `reviews_filtered.json` / `.csv` | Only reviews from the configured months (default: April, June, July) |

## Install & run

```bash
pip install -r requirements.txt
python scraper.py                    # full scrape, filter = April/June/July
python scraper.py --months 4,6,7 --year 2026   # restrict filter to one year
python scraper.py --max-pages 3      # quick test run
```

The scraper waits 0.5 s between page requests (configurable via `--delay`) and
retries failed requests with exponential backoff.

## Scheduled export (GitHub Actions)

The workflow [`.github/workflows/jugglux-reviews.yml`](../.github/workflows/jugglux-reviews.yml)
runs every Monday at 05:00 UTC (and on manual dispatch), re-scrapes all
reviews, and commits updated exports in `data/` back to the repository when
anything changed.

## Q3 review count notification (October 1)

[`q3_report.py`](q3_report.py) scrapes all reviews and prints a Markdown
report with the number of reviews posted in **July, August, and September**
of the current year:

```bash
python q3_report.py                                  # fresh scrape
python q3_report.py --from-file data/reviews_all.json --year 2026
```

The workflow
[`.github/workflows/jugglux-q3-report.yml`](../.github/workflows/jugglux-q3-report.yml)
runs **every October 1 at 06:00 UTC** (and on manual dispatch), scrapes the
live site, and opens a GitHub issue with the July–September counts, assigned
to the repo owner — GitHub's issue notification serves as the reminder email.

> Note: GitHub only runs scheduled workflows from the default branch, so both
> workflows become active once this branch is merged into `main`.
