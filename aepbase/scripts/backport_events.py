#!/usr/bin/env python3
"""Backport birthdays and anniversaries from `people` / `person-shared-data`
into the new `events` collection.

This is a one-shot migration in support of removing the legacy fields from the
people module. It is idempotent: rerunning skips events that already exist for
the same (tag, sorted person ids) tuple.

Safety:

  * A timestamped JSON snapshot of `people`, `person-shared-data`, and
    `events` is written to disk before any mutation. The snapshot is the
    authoritative restore mechanism — if the script makes a mess, you can
    re-import the JSON via curl/aepbase admin tools.
  * `--dry-run` prints the planned creates without writing.
  * `--skip-backup` is honored only with `--dry-run`.

Usage:

    python3 aepbase/scripts/backport_events.py \\
        --email admin@example.com \\
        --password '...' \\
        --aep-url http://localhost:8090 \\
        --backup-dir ./backups \\
        --dry-run

To apply, drop `--dry-run`. The script prints `N created, M skipped` on exit.
"""

from __future__ import annotations

import argparse
import datetime as _dt
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path
from typing import Any


# ---------------------------------------------------------------------------
# HTTP client (mirrors aepbase/scripts/migrate_pb_to_aep.py:AepClient)
# ---------------------------------------------------------------------------


class AepClient:
    def __init__(self, base_url: str, token: str, dry_run: bool = False) -> None:
        self.base = base_url.rstrip("/")
        self.token = token
        self.dry_run = dry_run

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.token}"}

    def _request(
        self,
        method: str,
        path: str,
        *,
        json_body: Any = None,
    ) -> Any:
        url = f"{self.base}{path}"
        headers = self._headers()
        data: bytes | None = None

        if json_body is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(json_body).encode("utf-8")

        if self.dry_run and method != "GET":
            preview = json.dumps(json_body) if json_body else ""
            print(f"  DRY {method} {path}  {preview[:120]}")
            return {"id": "dry-" + uuid.uuid4().hex[:8]}

        req = urllib.request.Request(url, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req) as resp:
                body = resp.read()
                if not body:
                    return None
                return json.loads(body)
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"{method} {path} -> {e.code}: {body}") from None

    def list(self, plural: str) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        page_token: str | None = None
        while True:
            qs = "?max_page_size=200"
            if page_token:
                qs += "&page_token=" + urllib.parse.quote(page_token)
            page = self._request("GET", f"/{plural}" + qs)
            out.extend(page.get("results", []) or [])
            page_token = page.get("next_page_token") or None
            if not page_token:
                break
        return out

    def create(self, plural: str, body: dict[str, Any]) -> dict[str, Any]:
        return self._request("POST", f"/{plural}", json_body=body)


def login(base_url: str, email: str, password: str) -> tuple[str, str]:
    """Returns (token, admin_user_id)."""
    url = f"{base_url.rstrip('/')}/users/:login"
    data = json.dumps({"email": email, "password": password}).encode()
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as resp:
        body = json.loads(resp.read())
    return body["token"], body["user"]["id"]


# ---------------------------------------------------------------------------
# Snapshot
# ---------------------------------------------------------------------------


def write_snapshot(
    backup_dir: Path,
    people: list[dict[str, Any]],
    shared_data: list[dict[str, Any]],
    events: list[dict[str, Any]],
) -> Path:
    timestamp = _dt.datetime.now().strftime("%Y%m%dT%H%M%S")
    target = backup_dir / f"events-backport-{timestamp}"
    target.mkdir(parents=True, exist_ok=True)

    def _dump(name: str, payload: list[dict[str, Any]]) -> None:
        with (target / name).open("w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, sort_keys=True, default=str)

    _dump("people.json", people)
    _dump("person_shared_data.json", shared_data)
    _dump("events_existing.json", events)
    return target


# ---------------------------------------------------------------------------
# Plan
# ---------------------------------------------------------------------------


def _person_ref(person_id: str) -> str:
    return f"people/{person_id}"


def _sorted_refs(person_ids: list[str]) -> list[str]:
    return sorted({_person_ref(p) for p in person_ids if p})


def _existing_key(event: dict[str, Any]) -> tuple[str, tuple[str, ...]]:
    tag = (event.get("tag") or "").strip()
    refs = tuple(sorted(event.get("people") or []))
    return (tag, refs)


def build_plan(
    people: list[dict[str, Any]],
    shared_data: list[dict[str, Any]],
    existing_events: list[dict[str, Any]],
    created_by: str,
) -> list[dict[str, Any]]:
    """Return the list of event payloads we'd POST."""

    existing = {_existing_key(e) for e in existing_events}
    name_by_id = {p["id"]: p.get("name", "") for p in people}
    plan: list[dict[str, Any]] = []

    for person in people:
        birthday = person.get("birthday")
        if not birthday or not str(birthday).strip():
            continue
        refs = _sorted_refs([person["id"]])
        if ("birthday", tuple(refs)) in existing:
            continue
        plan.append(
            {
                "name": f"{person.get('name', '')}'s Birthday".strip(),
                "date": birthday,
                "tag": "birthday",
                "people": refs,
                "created_by": created_by,
            }
        )

    for shared in shared_data:
        anniversary = shared.get("anniversary")
        if not anniversary or not str(anniversary).strip():
            continue
        person_ids = [shared.get("person_a"), shared.get("person_b")]
        person_ids = [p for p in person_ids if p]
        if not person_ids:
            continue
        refs = _sorted_refs(person_ids)
        if ("anniversary", tuple(refs)) in existing:
            continue
        primary_name = name_by_id.get(person_ids[0], "")
        plan.append(
            {
                "name": f"{primary_name}'s Anniversary".strip(),
                "date": anniversary,
                "tag": "anniversary",
                "people": refs,
                "created_by": created_by,
            }
        )

    return plan


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Backport birthdays/anniversaries from people + "
            "person-shared-data into the events collection."
        )
    )
    parser.add_argument("--aep-url", default="http://localhost:8090")
    parser.add_argument("--email", default=os.environ.get("AEPBASE_ADMIN_EMAIL"))
    parser.add_argument("--password", default=os.environ.get("AEPBASE_ADMIN_PASSWORD"))
    parser.add_argument(
        "--backup-dir",
        default="./backups",
        help="Parent directory to write the JSON snapshot (default ./backups).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print planned event creates without writing.",
    )
    parser.add_argument(
        "--skip-backup",
        action="store_true",
        help="Skip the on-disk snapshot. Only honored with --dry-run.",
    )
    parser.add_argument(
        "--user-id",
        default=None,
        help=(
            "users/{user_id} value to stamp on synthesized events. "
            "Defaults to the authenticated admin's id."
        ),
    )
    args = parser.parse_args()

    if not args.email or not args.password:
        print(
            "error: --email and --password are required (or set "
            "AEPBASE_ADMIN_EMAIL / AEPBASE_ADMIN_PASSWORD).",
            file=sys.stderr,
        )
        return 2

    if args.skip_backup and not args.dry_run:
        print(
            "error: --skip-backup is only allowed with --dry-run.",
            file=sys.stderr,
        )
        return 2

    print(f"-> logging in to {args.aep_url}")
    token, admin_user_id = login(args.aep_url, args.email, args.password)
    created_by = (
        args.user_id
        if args.user_id and args.user_id.startswith("users/")
        else f"users/{args.user_id or admin_user_id}"
    )

    client = AepClient(args.aep_url, token, dry_run=args.dry_run)

    print("-> fetching people, person-shared-data, events")
    people = client.list("people")
    shared = client.list("person-shared-data")
    events = client.list("events")
    print(
        f"   {len(people)} people, {len(shared)} shared-data records, "
        f"{len(events)} existing events"
    )

    if not args.skip_backup:
        backup = write_snapshot(Path(args.backup_dir), people, shared, events)
        print(f"-> snapshot written to {backup}")
    else:
        print("-> skipping snapshot (--skip-backup with --dry-run)")

    plan = build_plan(people, shared, events, created_by)
    if not plan:
        print("nothing to do — every person/anniversary already has a matching event.")
        return 0

    print(f"-> planned creates: {len(plan)}")
    created = 0
    failed = 0
    for payload in plan:
        try:
            client.create("events", payload)
            created += 1
        except RuntimeError as exc:
            failed += 1
            print(f"   ! create failed for {payload['name']!r}: {exc}", file=sys.stderr)

    skipped = (
        len(people)
        - sum(1 for p in plan if p["tag"] == "birthday")
        + len(shared)
        - sum(1 for p in plan if p["tag"] == "anniversary")
    )
    print(
        f"done. {created} created, {failed} failed, "
        f"{max(0, skipped)} skipped (already present or no date)."
    )
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
