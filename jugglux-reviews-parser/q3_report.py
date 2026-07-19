#!/usr/bin/env python3
"""Scrape jugglux.ch reviews and report how many were posted in July,
August, and September of the given year (default: current year).

Prints a Markdown report to stdout (used by the scheduled GitHub Actions
workflow to open a notification issue on October 1).

Usage:
  python q3_report.py [--year 2026] [--from-file data/reviews_all.json]
"""

import argparse
import json
from datetime import date
from pathlib import Path

from scraper import scrape

MONTH_NAMES = {7: "Juli", 8: "August", 9: "September"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--year", type=int, default=date.today().year)
    parser.add_argument("--from-file", default=None,
                        help="count from an existing reviews_all.json instead of scraping")
    args = parser.parse_args()

    if args.from_file:
        reviews = json.loads(Path(args.from_file).read_text(encoding="utf-8"))
    else:
        reviews = scrape()

    counts = {m: 0 for m in MONTH_NAMES}
    for r in reviews:
        if not r["date"]:
            continue
        d = date.fromisoformat(r["date"])
        if d.year == args.year and d.month in counts:
            counts[d.month] += 1

    total = sum(counts.values())
    print(f"# Jugglux Bewertungen Juli–September {args.year}")
    print()
    print("| Monat | Anzahl Bewertungen |")
    print("|-------|--------------------|")
    for month, name in MONTH_NAMES.items():
        print(f"| {name} {args.year} | {counts[month]} |")
    print(f"| **Total** | **{total}** |")
    print()
    print(f"Gesamtbestand auf jugglux.ch: {len(reviews)} Bewertungen "
          f"(Stand {date.today().isoformat()}).")


if __name__ == "__main__":
    main()
