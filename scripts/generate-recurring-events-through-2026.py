#!/usr/bin/env python3
"""
Expand Recurring activities into dated events[] through 2026-12-31.

Uses recurrenceDetails (weekdays + startTime, or slots) when present.
When recurrenceDetails is empty, infers (weekday, startTime) from the most
common pattern among existing events for that activityId — except ac0001/ac0002
(Karaoke / DJ Karaoke), which are filled on alternating Saturdays (19:00) so
they do not double-book the same slot.

Skips if recurrenceType is not 'Recurring'. Does not generate for one-off
activity categories (empty recurrenceType). Skips activities with no pattern
and no inferable events (logs warning).

Idempotent: does not add (activityId, date, startTime) that already exists.
"""

from __future__ import annotations

import json
import re
from collections import Counter
from datetime import date, datetime, timedelta
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
JSON_PATH = REPO_ROOT / "assets" / "data" / "json" / "mmhp-master-data.json"

WEEKDAY_NAMES = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
]

DATE_FROM = date(2026, 1, 1)
DATE_THROUGH = date(2026, 12, 31)

# Karaoke / DJ: one or the other each Saturday, same time, shared hall.
KARAOKE_DJ_IDS = frozenset({"ac0001", "ac0002"})


def norm_time(raw: str) -> str:
    s = (raw or "").strip()
    if not s:
        return "00:00"
    parts = s.split(":")
    h = int(parts[0])
    m = int(parts[1]) if len(parts) > 1 else 0
    return f"{h:02d}:{m:02d}"


def parse_recurrence_entries(act: dict) -> list[tuple[str, str]]:
    rd = act.get("recurrenceDetails") or {}
    entries: list[tuple[str, str]] = []

    slots = rd.get("slots")
    if isinstance(slots, list) and slots:
        for sl in slots:
            if not isinstance(sl, dict):
                continue
            w = str(sl.get("weekday") or sl.get("day") or "").strip()
            st = str(sl.get("startTime") or sl.get("time") or "").strip()
            if w and st:
                entries.append((w, st))
        return entries

    days = rd.get("weekdays") or rd.get("daysOfWeek") or []
    st_one = str(rd.get("startTime") or rd.get("time") or "").strip()
    if isinstance(days, list) and days and st_one:
        for d in days:
            entries.append((str(d).strip(), st_one))
    return entries


def infer_entries_from_events(events: list, activity_id: str) -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    for ev in events:
        if (ev.get("activityId") or "").strip() != activity_id:
            continue
        ds = (ev.get("date") or "").strip()
        st = norm_time(str(ev.get("startTime") or "19:00"))
        if not ds or len(ds) != 10:
            continue
        try:
            dt = datetime.strptime(ds, "%Y-%m-%d").date()
        except ValueError:
            continue
        wd = WEEKDAY_NAMES[dt.weekday()]
        pairs.append((wd, st))
    if not pairs:
        return []
    (wd, st), _ = Counter(pairs).most_common(1)[0]
    return [(wd, st)]


def card_line3_from_iso(ymd: str) -> str:
    dt = datetime.strptime(ymd, "%Y-%m-%d")
    return f"{dt.strftime('%b')} {dt.day} {dt.year}"


def derive_event_name(card_line1: str, activity_name: str) -> str:
    c1 = (card_line1 or "").strip()
    an = (activity_name or "").strip()
    if not c1 and not an:
        return "Event"
    if not an:
        return c1
    if not c1:
        return an
    return f"{c1} — {an}"


def max_event_num(events: list) -> int:
    nmax = 0
    for ev in events:
        eid = (ev.get("id") or "").strip()
        m = re.match(r"^ev(\d+)$", eid, re.I)
        if m:
            nmax = max(nmax, int(m.group(1)))
    return nmax


def next_event_id(n: int) -> str:
    return f"ev{n:04d}"


def build_event_row(act: dict, ymd: str, start_time: str, eid: str) -> dict:
    aname = (act.get("activityName") or "Event").strip()
    loc = (act.get("location") or "").strip() or "TBD"
    card1 = aname
    st = norm_time(start_time)
    row = {
        "id": eid,
        "activityId": act["id"],
        "date": ymd,
        "startTime": st,
        "endTime": "",
        "isActive": True,
        "isSpecialEvent": False,
        "location": loc,
        "eventName": derive_event_name(card1, aname),
        "cardLine1": card1,
        "cardLine2": aname,
        "cardLine3": card_line3_from_iso(ymd),
    }
    return row


def first_saturday_on_or_after(d: date) -> date:
    while d.weekday() != 5:
        d += timedelta(days=1)
    return d


def fill_karaoke_dj_alternating(
    events: list,
    activities_by_id: dict[str, dict],
    keys: set[tuple[str, str, str]],
    next_n: int,
) -> tuple[int, int]:
    """Alternating Saturdays ac0001 / ac0002 at 19:00; skip if either slot taken."""
    added = 0
    d0 = first_saturday_on_or_after(DATE_FROM)
    d = d0
    while d <= DATE_THROUGH:
        idx = (d - d0).days // 7
        aid = "ac0001" if idx % 2 == 0 else "ac0002"
        other = "ac0002" if aid == "ac0001" else "ac0001"
        ymd = d.isoformat()
        st = "19:00"
        nk = (aid, ymd, st)
        ok_other = (other, ymd, st)
        if nk in keys or ok_other in keys:
            d += timedelta(days=7)
            continue
        act = activities_by_id.get(aid)
        if not act:
            d += timedelta(days=7)
            continue
        ev = build_event_row(act, ymd, st, next_event_id(next_n))
        events.append(ev)
        keys.add(nk)
        next_n += 1
        added += 1
        d += timedelta(days=7)
    return added, next_n


def existing_keys(events: list) -> set[tuple[str, str, str]]:
    keys: set[tuple[str, str, str]] = set()
    for ev in events:
        aid = (ev.get("activityId") or "").strip()
        ds = (ev.get("date") or "").strip()
        if not aid or not ds:
            continue
        keys.add((aid, ds, norm_time(str(ev.get("startTime") or "00:00"))))
    return keys


def main() -> None:
    text = JSON_PATH.read_text(encoding="utf-8")
    data = json.loads(text)
    activities = data.get("activities") or []
    events = list(data.get("events") or [])
    activities_by_id = {str(a.get("id") or "").strip(): a for a in activities if a.get("id")}

    keys = existing_keys(events)
    next_n = max_event_num(events) + 1
    added = 0
    warnings: list[str] = []

    for act in activities:
        rt = str(act.get("recurrenceType") or "").strip()
        if rt != "Recurring":
            continue
        aid = (act.get("id") or "").strip()
        if not aid:
            continue
        if aid in KARAOKE_DJ_IDS:
            continue

        entries = parse_recurrence_entries(act)
        if not entries:
            entries = infer_entries_from_events(events, aid)
        if not entries:
            warnings.append(f"No pattern for {aid} ({act.get('activityName')}); skipped.")
            continue

        d = DATE_FROM
        while d <= DATE_THROUGH:
            wd = WEEKDAY_NAMES[d.weekday()]
            ymd = d.isoformat()
            for wname, st_raw in entries:
                if wname != wd:
                    continue
                st = norm_time(st_raw)
                k = (aid, ymd, st)
                if k in keys:
                    break
                ev = build_event_row(act, ymd, st_raw, next_event_id(next_n))
                events.append(ev)
                keys.add(k)
                next_n += 1
                added += 1
                break
            d += timedelta(days=1)

    kdj_added, next_n = fill_karaoke_dj_alternating(events, activities_by_id, keys, next_n)
    added += kdj_added

    events.sort(key=lambda e: (e.get("date") or "", e.get("startTime") or "", e.get("id") or ""))
    data["events"] = events

    JSON_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {JSON_PATH}")
    print(f"Added {added} new events (through {DATE_THROUGH.isoformat()}), including {kdj_added} Karaoke/DJ alternating Saturdays.")
    for w in warnings:
        print("WARNING:", w)


if __name__ == "__main__":
    main()
