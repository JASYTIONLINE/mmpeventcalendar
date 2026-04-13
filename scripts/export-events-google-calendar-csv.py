#!/usr/bin/env python3
"""Emit Google Calendar import CSV from mmhp-master-data.json events.

Google Calendar CSV import (see https://support.google.com/calendar/answer/37118):
  - First row: English headers exactly as below.
  - Required: Subject, Start Date. (We also emit Start/End time and End date for timed events.)
  - Start Date / End Date: MM/DD/YYYY  - Start Time / End Time: 12-hour with space before AM/PM, e.g. "2:30 PM"
  - All Day Event / Private: True or False
  - UTF-8 encoding; csv module quotes fields that contain commas or quotes.

Rows that cannot be converted to a valid Google row (bad date or unparseable start time)
are skipped and reported on stderr.
"""

from __future__ import annotations

import csv
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
JSON_PATH = REPO_ROOT / "assets" / "data" / "json" / "mmhp-master-data.json"
OUT_PATH = REPO_ROOT / "assets" / "data" / "csv" / "mmhp-events-google-calendar-import.csv"

# Matches common Google Calendar CSV templates and import help examples.
HEADERS = [
    "Subject",
    "Start Date",
    "Start Time",
    "End Date",
    "End Time",
    "All Day Event",
    "Description",
    "Location",
    "Private",
]

DEFAULT_DURATION_HOURS_WHEN_NO_END = 1


def parse_hhmm(s: str) -> tuple[int, int] | None:
    """Parse H:MM or HH:MM or with optional :SS; return None if invalid."""
    s = (s or "").strip()
    if not s:
        return None
    parts = s.split(":")
    try:
        h = int(parts[0], 10)
        m = int(parts[1], 10) if len(parts) > 1 else 0
    except (ValueError, IndexError):
        return None
    if h < 0 or h > 23 or m < 0 or m > 59:
        return None
    return h, m


def to_12h(h: int, m: int) -> str:
    period = "PM" if h >= 12 else "AM"
    h12 = h % 12
    if h12 == 0:
        h12 = 12
    return f"{h12}:{m:02d} {period}"


def iso_to_mmddyyyy(iso_date: str) -> str | None:
    try:
        return datetime.strptime(iso_date.strip(), "%Y-%m-%d").strftime("%m/%d/%Y")
    except ValueError:
        return None


def row_for_event(ev: dict) -> tuple[list[str] | None, str | None]:
    """Return (csv_row, skip_reason). skip_reason set when row is omitted."""
    date_raw = ev.get("date")
    if date_raw is None or not str(date_raw).strip():
        return None, "missing date"
    start_d = iso_to_mmddyyyy(str(date_raw))
    if not start_d:
        return None, f"invalid date {date_raw!r}"

    st = parse_hhmm(str(ev.get("startTime") or ""))
    if st is None:
        return None, "missing or invalid startTime"
    sh, sm = st
    start_t = to_12h(sh, sm)
    start_min = sh * 60 + sm

    base = datetime.strptime(str(date_raw).strip(), "%Y-%m-%d")
    end_raw = (ev.get("endTime") or "").strip()

    if end_raw:
        et = parse_hhmm(end_raw)
        if et is None:
            end_raw = ""
        else:
            eh, em = et
            end_min = eh * 60 + em
            if end_min > start_min:
                end_d = start_d
                end_t = to_12h(eh, em)
            elif end_min < start_min:
                # e.g. 22:00–01:00: end is next calendar day
                end_day = base + timedelta(days=1)
                end_d = end_day.strftime("%m/%d/%Y")
                end_t = to_12h(eh, em)
            else:
                # Same clock time as start: use one hour after start (Google dislikes zero-length)
                end_dt = base + timedelta(hours=sh, minutes=sm) + timedelta(hours=DEFAULT_DURATION_HOURS_WHEN_NO_END)
                end_d = end_dt.strftime("%m/%d/%Y")
                end_t = to_12h(end_dt.hour, end_dt.minute)

    if not end_raw or not parse_hhmm(end_raw):
        end_dt = base + timedelta(hours=sh, minutes=sm) + timedelta(hours=DEFAULT_DURATION_HOURS_WHEN_NO_END)
        end_d = end_dt.strftime("%m/%d/%Y")
        end_t = to_12h(end_dt.hour, end_dt.minute)

    subject = (ev.get("eventName") or "").strip() or "(no title)"
    # Single-line subject/description avoids odd CSV/import behavior
    subject = " ".join(subject.splitlines()).strip() or "(no title)"

    desc = f"mmhp event id: {ev.get('id', '')}; activityId: {ev.get('activityId', '')}"
    desc = " ".join(desc.splitlines())
    location = " ".join(((ev.get("location") or "").strip()).splitlines())

    return (
        [
            subject,
            start_d,
            start_t,
            end_d,
            end_t,
            "False",
            desc,
            location,
            "False",
        ],
        None,
    )


def main() -> None:
    data = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    events = [e for e in data.get("events", []) if e.get("isActive", True)]

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    written = 0
    skipped: list[tuple[str, str]] = []

    with OUT_PATH.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
        w.writerow(HEADERS)
        for ev in events:
            row, reason = row_for_event(ev)
            if row is None:
                eid = ev.get("id", "?")
                skipped.append((str(eid), reason or "unknown"))
                continue
            w.writerow(row)
            written += 1

    print(f"Wrote {written} events to {OUT_PATH}")
    if skipped:
        print(f"Skipped {len(skipped)} active events (not import-safe):", file=sys.stderr)
        for eid, reason in skipped[:25]:
            print(f"  {eid}: {reason}", file=sys.stderr)
        if len(skipped) > 25:
            print(f"  ... and {len(skipped) - 25} more", file=sys.stderr)


if __name__ == "__main__":
    main()
