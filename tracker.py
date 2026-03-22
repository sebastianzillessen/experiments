#!/usr/bin/env python3
"""
Apple Screen Time Tracker

Extracts app usage from macOS knowledgeC.db, classifies sessions as work or
personal, incorporates WiFi connection history, and outputs a rounded
time-tracking report for business time verification.

Requirements:
  - macOS (uses knowledgeC.db from Screen Time)
  - Full Disk Access granted to Terminal / Python in
    System Settings > Privacy & Security > Full Disk Access
  - PyYAML:  pip install pyyaml

Usage:
  python tracker.py init               # create default config
  python tracker.py report             # today's work-time report
  python tracker.py report -d 2024-03-20
  python tracker.py apps --days 7     # list all apps seen in last 7 days
  python tracker.py wifi               # log current WiFi (run via cron/LaunchAgent)
"""

import argparse
import json
import os
import re
import sqlite3
import subprocess
import sys
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import yaml

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Apple's CoreData reference date (seconds since this = Apple timestamp)
APPLE_EPOCH = datetime(2001, 1, 1, tzinfo=timezone.utc)

DEFAULT_CONFIG: dict = {
    "work_apps": [
        # --- IDEs / editors ---
        "com.microsoft.VSCode",
        "com.apple.dt.Xcode",
        "com.jetbrains.intellij",
        "com.jetbrains.pycharm",
        "com.jetbrains.webstorm",
        "com.jetbrains.rubymine",
        "com.jetbrains.goland",
        # --- Terminals ---
        "com.apple.Terminal",
        "com.googlecode.iterm2",
        "com.github.wez.wezterm",
        "dev.warp.Warp-Stable",
        # --- Communication / meetings ---
        "com.microsoft.teams",
        "com.microsoft.teams2",
        "com.tinyspeck.slackmacgap",
        "com.slack.Slack",
        "com.microsoft.outlook",
        "com.apple.mail",
        "com.zoom.us",
        "us.zoom.xos",
        "com.webex.meetingmanager",
        # --- Office / docs ---
        "com.microsoft.Word",
        "com.microsoft.Excel",
        "com.microsoft.Powerpoint",
        "com.apple.Pages",
        "com.apple.Numbers",
        "com.apple.Keynote",
        # --- Project / task management ---
        "com.notion.id",
        "com.linear.LinearLauncher",
        "com.atlassian.jira-desktop",
        "com.github.GitHubDesktop",
        "com.sourcetreeapp.SourceTree",
        "com.towerapp.TowerTwo",
    ],
    "personal_apps": [
        "com.apple.Safari",
        "com.netflix.Netflix",
        "com.spotify.client",
        "com.apple.Music",
        "com.apple.TV",
        "com.apple.FaceTime",
        "com.apple.iChat",
        "com.apple.Photos",
        "com.apple.news",
        "com.apple.podcasts",
        "com.reddit.Reddit",
        "com.twitter.twitter-mac",
        "com.burbn.instagram",
    ],
    # WiFi SSIDs that indicate you are at a work location
    "work_wifi": [
        "Office-WiFi",
        "YourCompanyNetwork",
    ],
    # Sessions shorter than this are ignored (noise reduction)
    "min_duration_seconds": 60,
    # Round all durations to this many minutes
    "round_minutes": 5,
    # Merge consecutive work periods separated by less than this (minutes)
    "merge_gap_minutes": 10,
    # knowledgeC.db location (expand ~ automatically)
    "db_path": "~/Library/Application Support/Knowledge/knowledgeC.db",
    # WiFi connection log written by `tracker.py wifi` (cron/LaunchAgent)
    "wifi_log": "~/.screentime_wifi.log",
}


# ---------------------------------------------------------------------------
# Time helpers
# ---------------------------------------------------------------------------

def apple_ts_to_dt(ts: float) -> datetime:
    """Convert Apple CoreData timestamp (float) to UTC datetime."""
    return APPLE_EPOCH + timedelta(seconds=ts)


def dt_to_apple_ts(dt: datetime) -> float:
    """Convert UTC datetime to Apple CoreData timestamp."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return (dt - APPLE_EPOCH).total_seconds()


def round_to_n_minutes(td: timedelta, n: int = 5) -> timedelta:
    """Round a timedelta to the nearest n minutes (minimum 0)."""
    total_seconds = td.total_seconds()
    rounded = round(total_seconds / (n * 60)) * (n * 60)
    return timedelta(seconds=max(rounded, 0))


def fmt_duration(td: timedelta) -> str:
    """Format a timedelta as HH:MM."""
    total = int(max(td.total_seconds(), 0))
    h, rem = divmod(total, 3600)
    m = rem // 60
    return f"{h:02d}:{m:02d}"


def local_hm(dt: datetime) -> str:
    """Format UTC datetime as local HH:MM."""
    return dt.astimezone().strftime("%H:%M")


# ---------------------------------------------------------------------------
# WiFi helpers
# ---------------------------------------------------------------------------

def get_current_wifi() -> Optional[str]:
    """Return the current WiFi SSID or None."""
    for iface in ("en0", "en1", "en2"):
        try:
            r = subprocess.run(
                ["networksetup", "-getairportnetwork", iface],
                capture_output=True, text=True, timeout=5,
            )
            m = re.search(r"Current Wi-Fi Network: (.+)", r.stdout)
            if m:
                return m.group(1).strip()
        except (subprocess.TimeoutExpired, FileNotFoundError):
            continue
    return None


def log_wifi_event(wifi_log: Path) -> None:
    """Append current WiFi state to the log file (join/leave)."""
    ssid = get_current_wifi()
    ts = datetime.now(timezone.utc).isoformat(timespec="seconds")
    event = "join" if ssid else "leave"
    entry = f"{ts}\t{event}\t{ssid or '-'}\n"
    wifi_log.parent.mkdir(parents=True, exist_ok=True)
    with open(wifi_log, "a") as fh:
        fh.write(entry)
    print(f"WiFi logged: {event} {ssid or '(none)'} at {ts}")


def load_wifi_log(log_path: Path, start_dt: datetime, end_dt: datetime) -> list[dict]:
    """Read WiFi events from the log file within the given UTC range."""
    if not log_path.exists():
        return []
    events: list[dict] = []
    with open(log_path) as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            parts = line.split("\t", 2)
            if len(parts) < 3:
                continue
            try:
                ts = datetime.fromisoformat(parts[0])
                if ts.tzinfo is None:
                    ts = ts.replace(tzinfo=timezone.utc)
                event_type = parts[1]   # "join" or "leave"
                ssid = parts[2]
                if start_dt <= ts <= end_dt:
                    events.append({"ts": ts, "type": event_type, "ssid": ssid})
            except (ValueError, IndexError):
                continue
    return sorted(events, key=lambda x: x["ts"])


def wifi_work_periods(
    events: list[dict],
    work_ssids: set[str],
    start_dt: datetime,
    end_dt: datetime,
) -> list[tuple[datetime, datetime]]:
    """Convert WiFi event log into (start, end) tuples of work-WiFi periods."""
    periods: list[tuple[datetime, datetime]] = []
    current_ssid: Optional[str] = None
    current_start: Optional[datetime] = None

    for ev in events:
        if ev["type"] == "join":
            current_ssid = ev["ssid"]
            current_start = ev["ts"]
        elif ev["type"] == "leave":
            if current_ssid in work_ssids and current_start:
                periods.append((current_start, ev["ts"]))
            current_ssid = None
            current_start = None

    # Still connected at end of window
    if current_ssid in work_ssids and current_start:
        periods.append((current_start, end_dt))

    return periods


# ---------------------------------------------------------------------------
# Screen-time DB helpers
# ---------------------------------------------------------------------------

def open_db(db_path: Path) -> sqlite3.Connection:
    """Open knowledgeC.db read-only; exit with a helpful message on failure."""
    if not db_path.exists():
        sys.exit(
            f"Database not found: {db_path}\n"
            "Make sure Screen Time is enabled in System Settings."
        )
    try:
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
        return conn
    except sqlite3.OperationalError as exc:
        sys.exit(
            f"Cannot open database: {exc}\n"
            "Grant Full Disk Access to Terminal (or Python) in\n"
            "System Settings > Privacy & Security > Full Disk Access."
        )


def get_devices(db_path: Path) -> dict[str, str]:
    """Return {device_id: device_name} from ZDEVICE table (best-effort)."""
    try:
        conn = open_db(db_path)
        rows = conn.execute("SELECT ZIDENTIFIER, ZNAME FROM ZDEVICE").fetchall()
        conn.close()
        return {r["ZIDENTIFIER"]: r["ZNAME"] for r in rows if r["ZIDENTIFIER"]}
    except Exception:
        return {}


def get_app_usage(
    db_path: Path, start_dt: datetime, end_dt: datetime
) -> list[dict]:
    """
    Return a list of app-usage records within the UTC time window.

    Each record: {bundle_id, start, end, duration, device_id}
    """
    start_ts = dt_to_apple_ts(start_dt)
    end_ts = dt_to_apple_ts(end_dt)

    conn = open_db(db_path)
    try:
        rows = conn.execute(
            """
            SELECT
                ZVALUESTRING  AS bundle_id,
                ZSTARTDATE    AS start_ts,
                ZENDDATE      AS end_ts,
                ZDEVICEID     AS device_id
            FROM ZOBJECT
            WHERE ZSTREAMNAME = '/app/inFocus'
              AND ZSTARTDATE  >= ?
              AND ZENDDATE    <= ?
              AND ZVALUESTRING IS NOT NULL
            ORDER BY ZSTARTDATE
            """,
            (start_ts, end_ts),
        ).fetchall()
    except sqlite3.OperationalError as exc:
        conn.close()
        sys.exit(f"Query error: {exc}")
    conn.close()

    results: list[dict] = []
    for row in rows:
        if row["end_ts"] is None:
            continue
        start = apple_ts_to_dt(row["start_ts"])
        end = apple_ts_to_dt(row["end_ts"])
        if end <= start:
            continue
        results.append(
            {
                "bundle_id": row["bundle_id"],
                "start": start,
                "end": end,
                "duration": end - start,
                "device_id": row["device_id"] or "mac",
            }
        )
    return results


# ---------------------------------------------------------------------------
# Classification & merging
# ---------------------------------------------------------------------------

def classify(entries: list[dict], config: dict) -> list[dict]:
    """Add 'category' key (work | personal | unknown) to each entry."""
    work_set = set(config.get("work_apps", []))
    personal_set = set(config.get("personal_apps", []))
    min_sec = config.get("min_duration_seconds", 60)

    out: list[dict] = []
    for e in entries:
        if e["duration"].total_seconds() < min_sec:
            continue
        bid = e["bundle_id"]
        if bid in work_set:
            cat = "work"
        elif bid in personal_set:
            cat = "personal"
        else:
            cat = "unknown"
        out.append({**e, "category": cat})
    return out


def merge_periods(
    entries: list[dict], gap_minutes: int = 10
) -> list[tuple[datetime, datetime]]:
    """
    Merge consecutive work-app sessions separated by ≤ gap_minutes into
    single work periods.  Returns [(start, end), ...] sorted by start.
    """
    work = sorted(
        [e for e in entries if e["category"] == "work"], key=lambda x: x["start"]
    )
    if not work:
        return []

    gap = timedelta(minutes=gap_minutes)
    periods: list[tuple[datetime, datetime]] = []
    cur_start = work[0]["start"]
    cur_end = work[0]["end"]

    for e in work[1:]:
        if e["start"] - cur_end <= gap:
            cur_end = max(cur_end, e["end"])
        else:
            periods.append((cur_start, cur_end))
            cur_start = e["start"]
            cur_end = e["end"]
    periods.append((cur_start, cur_end))
    return periods


# ---------------------------------------------------------------------------
# Report generation
# ---------------------------------------------------------------------------

def overlaps_any(
    start: datetime, end: datetime, periods: list[tuple[datetime, datetime]]
) -> bool:
    return any(s < end and e > start for s, e in periods)


def generate_report(
    entries: list[dict],
    work_periods: list[tuple[datetime, datetime]],
    w_wifi_periods: list[tuple[datetime, datetime]],
    devices: dict[str, str],
    config: dict,
    target_date: date,
    current_wifi: Optional[str],
) -> str:
    round_n = config.get("round_minutes", 5)
    work_ssids = set(config.get("work_wifi", []))

    lines: list[str] = []
    sep = "=" * 62

    lines += [
        sep,
        f"  Screen Time Report  —  {target_date.strftime('%A, %B %d, %Y')}",
        sep,
    ]

    # Current WiFi status
    if current_wifi is not None:
        tag = " ✓ WORK WiFi" if current_wifi in work_ssids else " (personal)"
        lines.append(f"\nCurrent WiFi: {current_wifi}{tag}")
    else:
        lines.append("\nCurrent WiFi: not connected")

    # ---- App usage breakdown ----
    by_cat: dict[str, dict[str, timedelta]] = defaultdict(lambda: defaultdict(timedelta))
    for e in entries:
        by_cat[e["category"]][e["bundle_id"]] += e["duration"]

    lines.append("\n--- App Usage Breakdown ---")
    for cat, label in [("work", "WORK"), ("unknown", "Unclassified"), ("personal", "Personal")]:
        apps = by_cat.get(cat)
        if not apps:
            continue
        total = sum(apps.values(), timedelta())
        lines.append(f"\n[{label}]  total raw: {fmt_duration(total)}")
        for bid, dur in sorted(apps.items(), key=lambda x: x[1], reverse=True):
            if dur.total_seconds() >= 60:
                lines.append(f"  {bid:<52s} {fmt_duration(dur)}")

    # ---- Merged work periods ----
    lines.append("\n--- Work Periods (rounded to {n} min) ---".format(n=round_n))
    total_work = timedelta()

    if work_periods:
        for ws, we in work_periods:
            raw = we - ws
            rounded = round_to_n_minutes(raw, round_n)
            total_work += rounded
            on_wifi = overlaps_any(ws, we, w_wifi_periods)
            wifi_tag = "  [work WiFi]" if on_wifi else ""
            device_ids = {
                e["device_id"]
                for e in entries
                if e["category"] == "work" and e["start"] >= ws and e["end"] <= we
            }
            dev_names = ", ".join(
                devices.get(d, d) for d in device_ids if d
            ) or "mac"
            lines.append(
                f"  {local_hm(ws)} – {local_hm(we)}"
                f"  ({fmt_duration(rounded)})"
                f"  [{dev_names}]{wifi_tag}"
            )
    else:
        lines.append("  No work activity detected.")

    lines += [
        "",
        "─" * 62,
        f"  TOTAL WORKING TIME (rounded to {round_n} min):  "
        f"{fmt_duration(total_work)}",
        sep,
    ]
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Sub-commands
# ---------------------------------------------------------------------------

def cmd_init(args: argparse.Namespace) -> None:
    cfg_path = Path(args.config)
    if cfg_path.exists():
        print(f"Config already exists: {cfg_path}")
        return
    cfg_path.parent.mkdir(parents=True, exist_ok=True)
    with open(cfg_path, "w") as fh:
        yaml.dump(DEFAULT_CONFIG, fh, default_flow_style=False, allow_unicode=True, sort_keys=False)
    print(f"Created default config: {cfg_path}")
    print("Edit it to set your work apps and work WiFi SSIDs.")


def cmd_report(args: argparse.Namespace, config: dict) -> None:
    target_date = date.fromisoformat(args.date) if args.date else date.today()

    # Build UTC time window for the local calendar day
    local_tz = datetime.now().astimezone().tzinfo
    start_local = datetime(target_date.year, target_date.month, target_date.day, tzinfo=local_tz)
    end_local = start_local + timedelta(days=1)
    start_utc = start_local.astimezone(timezone.utc)
    end_utc = end_local.astimezone(timezone.utc)

    db_path = Path(config.get("db_path", DEFAULT_CONFIG["db_path"])).expanduser()
    wifi_log_path = Path(config.get("wifi_log", DEFAULT_CONFIG["wifi_log"])).expanduser()
    round_n = config.get("round_minutes", 5)
    gap_min = config.get("merge_gap_minutes", 10)

    print(f"Reading: {db_path}")
    devices = get_devices(db_path)
    raw = get_app_usage(db_path, start_utc, end_utc)
    print(f"Found {len(raw)} app-usage records for {target_date}.")

    classified = classify(raw, config)
    work_periods = merge_periods(classified, gap_minutes=gap_min)

    wifi_events = load_wifi_log(wifi_log_path, start_utc, end_utc)
    w_wifi_periods = wifi_work_periods(wifi_events, set(config.get("work_wifi", [])), start_utc, end_utc)

    current_wifi = get_current_wifi()

    report = generate_report(
        classified, work_periods, w_wifi_periods,
        devices, config, target_date, current_wifi,
    )
    print()
    print(report)

    if args.output:
        Path(args.output).write_text(report)
        print(f"\nSaved to: {args.output}")


def cmd_apps(args: argparse.Namespace, config: dict) -> None:
    """List every app seen over the last N days with total usage time."""
    start_date = date.fromisoformat(args.date) if args.date else date.today()
    local_tz = datetime.now().astimezone().tzinfo
    start_utc = datetime(start_date.year, start_date.month, start_date.day, tzinfo=local_tz).astimezone(timezone.utc)
    end_utc = start_utc + timedelta(days=args.days)

    db_path = Path(config.get("db_path", DEFAULT_CONFIG["db_path"])).expanduser()
    raw = get_app_usage(db_path, start_utc, end_utc)

    work_set = set(config.get("work_apps", []))
    personal_set = set(config.get("personal_apps", []))

    by_app: dict[str, timedelta] = defaultdict(timedelta)
    for e in raw:
        by_app[e["bundle_id"]] += e["duration"]

    print(f"\nAll apps from {start_date} over {args.days} day(s):\n")
    print(f"  {'Bundle ID':<54} {'Duration':>8}  Category")
    print("  " + "─" * 72)
    for bid, dur in sorted(by_app.items(), key=lambda x: x[1], reverse=True):
        if dur.total_seconds() < 60:
            continue
        if bid in work_set:
            cat = "work"
        elif bid in personal_set:
            cat = "personal"
        else:
            cat = "unknown"
        print(f"  {bid:<54} {fmt_duration(dur):>8}  {cat}")


def cmd_wifi(args: argparse.Namespace, config: dict) -> None:
    """Log the current WiFi connection to the log file."""
    wifi_log_path = Path(config.get("wifi_log", DEFAULT_CONFIG["wifi_log"])).expanduser()
    log_wifi_event(wifi_log_path)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def load_config(path: Path) -> dict:
    if not path.exists():
        print(f"No config at {path} — using defaults. Run `tracker.py init` to create one.")
        return DEFAULT_CONFIG.copy()
    with open(path) as fh:
        return yaml.safe_load(fh) or {}


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Apple Screen Time Tracker — classify screen time as work/personal",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--config", "-c",
        default=str(Path.home() / ".screentime_config.yaml"),
        help="Config file path (default: ~/.screentime_config.yaml)",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # init
    sub.add_parser("init", help="Create a default config file")

    # report
    rp = sub.add_parser("report", help="Generate a work-time report")
    rp.add_argument("--date", "-d", metavar="YYYY-MM-DD", help="Date to report (default: today)")
    rp.add_argument("--output", "-o", metavar="FILE", help="Save report to a file")

    # apps
    ap = sub.add_parser("apps", help="List all apps with total usage time")
    ap.add_argument("--date", "-d", metavar="YYYY-MM-DD", help="Start date (default: today)")
    ap.add_argument("--days", type=int, default=7, help="Number of days (default: 7)")

    # wifi
    sub.add_parser("wifi", help="Log current WiFi state (use with cron or LaunchAgent)")

    args = parser.parse_args()

    if args.command == "init":
        cmd_init(args)
        return

    config = load_config(Path(args.config))

    if args.command == "report":
        cmd_report(args, config)
    elif args.command == "apps":
        cmd_apps(args, config)
    elif args.command == "wifi":
        cmd_wifi(args, config)


if __name__ == "__main__":
    main()
