#!/usr/bin/env python3
"""Emit Google Calendar import CSV from mmhp-master-data.json events."""

from __future__ import annotations

import csv
import json
from datetime import datetime, timedelta
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
JSON_PATH = REPO_ROOT / "assets" / "data" / "json" / "mmhp-master-data.json"
OUT_PATH = REPO_ROOT / "assets" / "data" / "csv" / "mmhp-events-google-calendar-import.csv"

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


def parse_hhmm(s: str) -> tuple[int, int]:
    s = (s or "").strip()
    if not s:
        return 0, 0
    parts = s.split(":")
    return int(parts[0]), int(parts[1]) if len(parts) > 1 else 0


def to_12h(h: int, m: int) -> str:
    period = "PM" if h >= 12 else "AM"
    h12 = h % 12
    if h12 == 0:
        h12 = 12
    return f"{h12}:{m:02d} {period}"


def iso_to_mmddyyyy(iso_date: str) -> str:
    return datetime.strptime(iso_date.strip(), "%Y-%m-%d").strftime("%m/%d/%Y")


def row_for_event(ev: dict) -> list[str]:
    subject = (ev.get("eventName") or "").strip() or "(no title)"
    start_d = iso_to_mmddyyyy(ev["date"])
    sh, sm = parse_hhmm(ev.get("startTime") or "")
    start_t = to_12h(sh, sm)

    end_raw = (ev.get("endTime") or "").strip()
    if end_raw:
        eh, em = parse_hhmm(end_raw)
        end_t = to_12h(eh, em)
        end_d = start_d
    else:
        end = datetime.strptime(ev["date"], "%Y-%m-%d") + timedelta(hours=sh, minutes=sm)
        end = end + timedelta(hours=1)
        end_d = end.strftime("%m/%d/%Y")
        end_t = to_12h(end.hour, end.minute)

    desc = f"mmhp event id: {ev.get('id', '')}; activityId: {ev.get('activityId', '')}"
    location = (ev.get("location") or "").strip()

    return [
        subject,
        start_d,
        start_t,
        end_d,
        end_t,
        "False",
        desc,
        location,
        "False",
    ]


def main() -> None:
    data = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    events = [e for e in data.get("events", []) if e.get("isActive", True)]

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUT_PATH.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(HEADERS)
        for ev in events:
            w.writerow(row_for_event(ev))

    print(f"Wrote {len(events)} events to {OUT_PATH}")


if __name__ == "__main__":
    main()
