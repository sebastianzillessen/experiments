#!/usr/bin/env python3
"""Scrape all product reviews from https://www.jugglux.ch/alle-produkte-bewertungen.

Traverses every paginated review page, extracts all reviews, and writes:
  - data/reviews_all.json / data/reviews_all.csv          (full export)
  - data/reviews_filtered.json / data/reviews_filtered.csv (only the months
    given via --months, default: April, June, July)

Usage:
  python scraper.py                        # scrape everything
  python scraper.py --months 4,6,7        # month filter for the filtered export
  python scraper.py --year 2026           # additionally restrict filter to a year
  python scraper.py --max-pages 3         # for testing
"""

import argparse
import csv
import json
import re
import sys
import time
from datetime import date
from pathlib import Path

import requests
from bs4 import BeautifulSoup

BASE_URL = "https://www.jugglux.ch/alle-produkte-bewertungen"
USER_AGENT = (
    "Mozilla/5.0 (compatible; jugglux-reviews-parser/1.0; "
    "+https://github.com/sebastianzillessen/experiments)"
)

GERMAN_MONTHS = {
    "januar": 1, "februar": 2, "märz": 3, "maerz": 3, "april": 4,
    "mai": 5, "juni": 6, "juli": 7, "august": 8, "september": 9,
    "oktober": 10, "november": 11, "dezember": 12,
}


def parse_german_date(text):
    """'19. Juli 2026' -> date(2026, 7, 19), or None if unparseable."""
    m = re.match(r"\s*(\d{1,2})\.\s*(\wä?\w+)\s+(\d{4})", text.strip())
    if not m:
        return None
    day, month_name, year = m.groups()
    month = GERMAN_MONTHS.get(month_name.lower())
    if not month:
        return None
    return date(int(year), month, int(day))


def parse_rating(box):
    rating_span = box.select_one(".mill-votes--metadata-rating .product--rating")
    if not rating_span:
        return None
    full = len(rating_span.select("i.icon--star"))
    half = len(rating_span.select("i.icon--star-half"))
    return full + 0.5 * half


def parse_review_box(box):
    author_el = box.select_one(".mill-votes--metadata-author")
    author = author_el.get_text(strip=True) if author_el else ""
    author = re.sub(r"^Bewertung von\s+", "", author)

    date_el = box.select_one(".mill-votes--metadata-date")
    date_text = date_el.get_text(strip=True) if date_el else ""
    parsed = parse_german_date(date_text) if date_text else None

    title_el = box.select_one(".mill-votes--box-headline")
    text_el = box.select_one(".mill-votes--box-description-short")
    link_el = box.select_one(".votes-box-content-wrapper--image a[href]") or \
        box.select_one(".mill-votes--box-readmore a[href]")
    img_el = box.select_one(".votes-box-content-wrapper--image img")

    product_url = link_el["href"] if link_el else ""
    product_slug = product_url.rstrip("/").split("/")[-1].removesuffix(".html") if product_url else ""

    return {
        "author": author,
        "date": parsed.isoformat() if parsed else None,
        "date_raw": date_text,
        "rating": parse_rating(box),
        "title": title_el.get_text(" ", strip=True) if title_el else "",
        "text": text_el.get_text("\n", strip=True) if text_el else "",
        "product_url": product_url,
        "product_slug": product_slug,
        "image_url": (img_el.get("srcset") or img_el.get("src") or "") if img_el else "",
    }


def fetch_page(session, page, retries=3):
    url = BASE_URL if page == 1 else f"{BASE_URL}?p={page}"
    for attempt in range(retries):
        try:
            resp = session.get(url, timeout=60)
            resp.raise_for_status()
            return resp.text
        except requests.RequestException as exc:
            if attempt == retries - 1:
                raise
            wait = 2 ** (attempt + 1)
            print(f"  page {page}: {exc} — retrying in {wait}s", file=sys.stderr)
            time.sleep(wait)


def total_pages(soup):
    display = soup.select_one(".paging--display strong")
    if display and display.get_text(strip=True).isdigit():
        return int(display.get_text(strip=True))
    return 1


def scrape(max_pages=None, delay=0.5):
    session = requests.Session()
    session.headers["User-Agent"] = USER_AGENT

    html = fetch_page(session, 1)
    soup = BeautifulSoup(html, "html.parser")
    pages = total_pages(soup)
    if max_pages:
        pages = min(pages, max_pages)
    print(f"Found {pages} pages of reviews")

    reviews = []
    for page in range(1, pages + 1):
        if page > 1:
            time.sleep(delay)
            soup = BeautifulSoup(fetch_page(session, page), "html.parser")
        boxes = soup.select(".mill-votes--box.panel")
        reviews.extend(parse_review_box(b) for b in boxes)
        print(f"  page {page}/{pages}: {len(boxes)} reviews (total {len(reviews)})")
    return reviews


def write_exports(reviews, out_dir, stem):
    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / f"{stem}.json"
    csv_path = out_dir / f"{stem}.csv"
    json_path.write_text(
        json.dumps(reviews, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    fields = ["date", "date_raw", "author", "rating", "title", "text",
              "product_slug", "product_url", "image_url"]
    with csv_path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fields)
        writer.writeheader()
        writer.writerows(reviews)
    print(f"Wrote {len(reviews)} reviews to {json_path} and {csv_path}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--months", default="4,6,7",
                        help="comma-separated month numbers for the filtered export (default: 4,6,7 = April, June, July)")
    parser.add_argument("--year", type=int, default=None,
                        help="restrict the filtered export to this year (default: all years)")
    parser.add_argument("--out", default=str(Path(__file__).parent / "data"),
                        help="output directory (default: ./data)")
    parser.add_argument("--max-pages", type=int, default=None)
    parser.add_argument("--delay", type=float, default=0.5,
                        help="seconds between page requests")
    args = parser.parse_args()

    months = {int(m) for m in args.months.split(",") if m.strip()}
    reviews = scrape(max_pages=args.max_pages, delay=args.delay)
    reviews.sort(key=lambda r: r["date"] or "", reverse=True)

    out_dir = Path(args.out)
    write_exports(reviews, out_dir, "reviews_all")

    def in_filter(r):
        if not r["date"]:
            return False
        d = date.fromisoformat(r["date"])
        return d.month in months and (args.year is None or d.year == args.year)

    filtered = [r for r in reviews if in_filter(r)]
    write_exports(filtered, out_dir, "reviews_filtered")


if __name__ == "__main__":
    main()
