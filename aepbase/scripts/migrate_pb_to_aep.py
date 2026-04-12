#!/usr/bin/env python3
"""
Migrate PocketBase data to a running aepbase instance.

Reads directly from PocketBase's SQLite database (no need to start PB) and
POSTs records to aepbase via REST. File-field collections (gift_cards,
hsa_receipts, recipes) are sent as multipart/form-data with the binary
contents read from PB's storage tree.

Usage:
    python3 migrate_pb_to_aep.py \\
        --pb-data ~/tmp/pocketbase/pb_data \\
        --aep-url http://localhost:8090 \\
        --email admin@example.com \\
        --password <admin-password>

Optional flags:
    --wipe                Delete existing aepbase records before importing.
    --dry-run             Don't write — just print what would happen.
    --collection NAME     Migrate only one PB table (repeatable).
    --no-files            Skip file uploads (faster, useful for schema testing).

Caveats:
  - All `created_by` is collapsed to the aepbase admin user. PB-side
    multi-tenancy is not preserved.
  - aepbase manages `create_time`/`update_time` itself, so PB's `created`
    timestamps are NOT preserved on migrated records.
  - Required file fields (hsa_receipts.receipt_file): rows whose file is
    missing from disk are skipped with a warning.
  - notifications, recurring_notifications, and notification_subscriptions
    are children of the user in aepbase. They all land under the admin user
    regardless of PB's user_id.
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import sqlite3
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path
from typing import Any, Iterable


# ---------------------------------------------------------------------------
# PocketBase collection IDs (storage subdirectory names) for file fields.
# Looked up from `_collections` once and hard-coded here so the script doesn't
# need to query each run.
# ---------------------------------------------------------------------------
PBC_IDS = {
    "gift_cards": "pbc_4015667414",
    "hsa_receipts": "pbc_2396287311",
    "recipes": "pbc_842702175",
}


# ---------------------------------------------------------------------------
# Per-collection migration spec
# ---------------------------------------------------------------------------
# Each entry describes how to translate one PB table into aepbase calls.
#
#   pb_table:       SQLite table name in PB
#   aep_plural:     URL segment in aepbase (kebab-case)
#   parent_chain:   list of (parent_pb_table, fk_column) — describes the
#                   nested URL parents in order. Empty for top-level resources.
#   user_parent:    True if the resource is parented under /users/{admin_id}.
#                   (Used by notifications, recurring_notifications, etc.)
#   columns:        list of PB columns to copy verbatim into the aepbase body
#   json_columns:   list of PB columns whose value is stored as a JSON blob
#                   in PB and should be parsed before sending
#   file_field:     (column_name, required_bool) if the row has a file field
#   pb_collection:  PB collection id (pbc_*) for storage lookup; required
#                   when file_field is set
#   skip_if_empty:  list of columns where empty value means "skip the row"
#
# Order matters: parents must come before children.

MIGRATION_SPECS: list[dict[str, Any]] = [
    # ---- top-level / no parents ----
    {
        "pb_table": "people",
        "aep_plural": "people",
        "columns": ["name", "birthday"],
        # notification_preferences is intentionally dropped: aepbase declares
        # it as an `object` (legacy field, kept for back-compat) while PB
        # stores it as a JSON array. The recurring_notifications collection
        # already holds the per-person notification config so nothing is lost.
    },
    {
        "pb_table": "addresses",
        "aep_plural": "addresses",
        "columns": [
            "line1", "line2", "city", "state", "postal_code", "country",
            "wifi_network", "wifi_password",
            # shared_data_id is filled in a second pass after person_shared_data
            # has been migrated, since the two tables reference each other.
        ],
        "_defer_field": "shared_data_id",
    },
    {
        "pb_table": "person_shared_data",
        "aep_plural": "person-shared-data",
        "columns": ["anniversary"],
        # person_a/person_b/address_id remap to migrated ids
        "_remap_fields": {
            "person_a": "people",
            "person_b": "people",
            "address_id": "addresses",
        },
    },
    {
        "pb_table": "gift_cards",
        "aep_plural": "gift-cards",
        "columns": [
            "merchant", "card_number", "pin", "amount", "notes", "archived",
        ],
        "file_fields": [
            ("front_image", False),
            ("back_image", False),
        ],
        "pb_collection": "pbc_4015667414",
    },
    {
        "pb_table": "credit_cards",
        "aep_plural": "credit-cards",
        "columns": [
            "name", "issuer", "last_four", "annual_fee",
            "anniversary_date", "reset_mode", "notes", "archived",
        ],
    },
    {
        "pb_table": "groceries",
        "aep_plural": "groceries",
        "columns": ["name", "notes", "checked"],
        "_remap_fields": {"store": "stores"},
    },
    {
        "pb_table": "stores",
        "aep_plural": "stores",
        "columns": ["name", "sort_order"],
    },
    {
        "pb_table": "hsa_receipts",
        "aep_plural": "hsa-receipts",
        "columns": [
            "merchant", "service_date", "amount", "category", "patient",
            "status", "notes",
        ],
        "file_fields": [("receipt_file", True)],
        "pb_collection": "pbc_2396287311",
    },
    {
        "pb_table": "recipes",
        "aep_plural": "recipes",
        "columns": [
            "title", "source_type", "source_reference", "instructions",
            "version", "last_cooked", "rating",
        ],
        "json_columns": ["ingredients", "changelog"],
        "file_fields": [("image", False)],
        "pb_collection": "pbc_842702175",
    },
    {
        "pb_table": "actions",
        "aep_plural": "actions",
        "columns": ["name", "description", "script_id", "last_run_at"],
        "json_columns": ["parameters"],
    },
    # ---- children of people/addresses (above) need stores done before us ----
    # (groceries already covered above; stores must come BEFORE groceries.)
    # We re-sort below to enforce this in code.

    # ---- nested under top-level parents ----
    {
        "pb_table": "gift_card_transactions",
        "aep_plural": "transactions",
        "parent_chain": [("gift_cards", "gift_card")],
        "columns": [
            "transaction_type", "previous_amount", "new_amount",
            "amount_changed", "notes",
        ],
    },
    {
        "pb_table": "credit_card_perks",
        "aep_plural": "perks",
        "parent_chain": [("credit_cards", "credit_card")],
        "columns": ["name", "value", "frequency", "category", "notes"],
    },
    {
        "pb_table": "perk_redemptions",
        "aep_plural": "redemptions",
        "parent_chain": [
            ("credit_cards", None),  # resolved via perk → credit_card lookup
            ("credit_card_perks", "perk"),
        ],
        "columns": [
            "period_start", "period_end", "redeemed_at", "amount", "notes",
        ],
    },
    {
        "pb_table": "cooking_logs",
        "aep_plural": "logs",
        "parent_chain": [("recipes", "recipe")],
        "columns": [
            "date", "notes", "success", "rating", "deviated", "deviation_notes",
        ],
    },
    {
        "pb_table": "action_runs",
        "aep_plural": "runs",
        "parent_chain": [("actions", "action")],
        "columns": [
            "status", "started_at", "completed_at", "duration_ms", "error",
        ],
        # `logs` is intentionally dropped: PB stores it as a JSON array, but
        # the aepbase action_run schema declares it as `object` and rejects
        # arrays. Run history is regenerable by re-running actions, so it's
        # safe to skip during migration.
        "json_columns": ["result", "input_request", "input_response"],
    },
    # ---- user-parented ----
    {
        "pb_table": "notifications",
        "aep_plural": "notifications",
        "user_parent": True,
        "columns": [
            "title", "message", "notification_type", "scheduled_for",
            "sent_at", "read", "read_at", "source_collection", "source_id",
        ],
    },
    {
        "pb_table": "recurring_notifications",
        "aep_plural": "recurring-notifications",
        "user_parent": True,
        "columns": [
            "source_collection", "source_id", "title_template",
            "message_template", "reference_date_field", "timing", "enabled",
            "last_triggered",
        ],
    },
    {
        "pb_table": "notification_subscriptions",
        "aep_plural": "notification-subscriptions",
        "user_parent": True,
        "columns": ["enabled"],
        "json_columns": ["subscription_data"],
    },
]


# Move stores ahead of groceries (groceries depends on stores via _remap_fields)
def _ordered_specs() -> list[dict[str, Any]]:
    by_table = {s["pb_table"]: s for s in MIGRATION_SPECS}
    out: list[dict[str, Any]] = []
    seen: set[str] = set()

    def emit(name: str) -> None:
        if name in seen:
            return
        spec = by_table.get(name)
        if spec is None:
            return
        # Emit dependencies first.
        for dep_table in (spec.get("_remap_fields") or {}).values():
            emit(dep_table)
        for parent_table, _ in spec.get("parent_chain", []) or []:
            emit(parent_table)
        seen.add(name)
        out.append(spec)

    for s in MIGRATION_SPECS:
        emit(s["pb_table"])
    return out


# ---------------------------------------------------------------------------
# HTTP client
# ---------------------------------------------------------------------------

class AepClient:
    def __init__(self, base_url: str, token: str, dry_run: bool = False) -> None:
        self.base = base_url.rstrip("/")
        self.token = token
        self.dry_run = dry_run

    def _headers(self, extra: dict[str, str] | None = None) -> dict[str, str]:
        h = {"Authorization": f"Bearer {self.token}"}
        if extra:
            h.update(extra)
        return h

    def _request(
        self,
        method: str,
        path: str,
        *,
        json_body: Any = None,
        multipart: list[tuple[str, str, bytes, str | None]] | None = None,
    ) -> Any:
        url = f"{self.base}{path}"
        headers = self._headers()
        data: bytes | None = None

        if multipart is not None:
            boundary = "----aepmig" + uuid.uuid4().hex
            headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
            data = _build_multipart(boundary, multipart)
        elif json_body is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(json_body).encode("utf-8")

        if self.dry_run and method != "GET":
            preview = json.dumps(json_body) if json_body else "<multipart>"
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
            raise RuntimeError(f"{method} {path} → {e.code}: {body}") from None

    def list(self, plural: str, parent: list[str] | None = None) -> list[dict[str, Any]]:
        path = "/" + "/".join(parent) + f"/{plural}" if parent else f"/{plural}"
        out: list[dict[str, Any]] = []
        page_token: str | None = None
        while True:
            qs = "?max_page_size=200"
            if page_token:
                qs += "&page_token=" + urllib.parse.quote(page_token)
            page = self._request("GET", path + qs)
            out.extend(page.get("results", []) or [])
            page_token = page.get("next_page_token") or None
            if not page_token:
                break
        return out

    def create(
        self,
        plural: str,
        body: dict[str, Any],
        parent: list[str] | None = None,
        files: list[tuple[str, str, bytes]] | None = None,
    ) -> dict[str, Any]:
        path = "/" + "/".join(parent) + f"/{plural}" if parent else f"/{plural}"
        if files:
            parts: list[tuple[str, str, bytes, str | None]] = []
            parts.append(("resource", "", json.dumps(body).encode("utf-8"), "application/json"))
            for field_name, filename, content in files:
                mime, _ = mimetypes.guess_type(filename)
                parts.append((field_name, filename, content, mime))
            return self._request("POST", path, multipart=parts)
        return self._request("POST", path, json_body=body)

    def remove(
        self,
        plural: str,
        record_id: str,
        parent: list[str] | None = None,
    ) -> None:
        path = "/" + "/".join(parent) + f"/{plural}/{record_id}" if parent else f"/{plural}/{record_id}"
        self._request("DELETE", path)


def _build_multipart(boundary: str, parts: list[tuple[str, str, bytes, str | None]]) -> bytes:
    """Construct a multipart/form-data body. parts: (field, filename, content, mime)."""
    crlf = b"\r\n"
    out: list[bytes] = []
    for field, filename, content, mime in parts:
        out.append(f"--{boundary}".encode())
        if filename:
            disp = f'form-data; name="{field}"; filename="{filename}"'
        else:
            disp = f'form-data; name="{field}"'
        out.append(f"Content-Disposition: {disp}".encode())
        if mime:
            out.append(f"Content-Type: {mime}".encode())
        out.append(b"")
        out.append(content)
    out.append(f"--{boundary}--".encode())
    out.append(b"")
    return crlf.join(out)


# ---------------------------------------------------------------------------
# Migration driver
# ---------------------------------------------------------------------------

def login(base_url: str, email: str, password: str) -> tuple[str, str]:
    """Returns (token, admin_user_id)."""
    url = f"{base_url.rstrip('/')}/users/:login"
    data = json.dumps({"email": email, "password": password}).encode()
    req = urllib.request.Request(
        url, data=data, method="POST",
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as resp:
        body = json.loads(resp.read())
    return body["token"], body["user"]["id"]


def get_bool_columns(db_path: Path, table: str) -> set[str]:
    """Return the names of BOOLEAN columns in a PB table.

    SQLite stores booleans as integers, so a row read via the default Python
    adapter comes back as `0`/`1`. aepbase strict-typechecks boolean fields,
    so we recover the column type via PRAGMA and coerce in `fetch_pb_rows`.
    """
    conn = sqlite3.connect(str(db_path))
    try:
        cur = conn.execute(f"PRAGMA table_info({table})")
        return {
            row[1]
            for row in cur.fetchall()
            if (row[2] or "").upper() == "BOOLEAN"
        }
    finally:
        conn.close()


def fetch_pb_rows(db_path: Path, table: str) -> list[dict[str, Any]]:
    bool_cols = get_bool_columns(db_path, table)
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    try:
        cur = conn.execute(f"SELECT * FROM {table}")
        rows = [dict(row) for row in cur.fetchall()]
    finally:
        conn.close()
    for row in rows:
        for col in bool_cols:
            if col in row and row[col] is not None:
                row[col] = bool(row[col])
    return rows


def read_file_bytes(pb_data_dir: Path, pbc_id: str, record_id: str, filename: str) -> bytes | None:
    path = pb_data_dir / "storage" / pbc_id / record_id / filename
    if not path.exists():
        return None
    return path.read_bytes()


def build_body(
    spec: dict[str, Any],
    row: dict[str, Any],
    id_map: dict[tuple[str, str], str],
    admin_user_id: str,
) -> dict[str, Any] | None:
    """Translate a PB row into an aepbase request body. Returns None to skip."""
    body: dict[str, Any] = {}

    # Plain columns
    for col in spec.get("columns", []):
        if col not in row:
            continue
        val = row[col]
        if val == "" or val is None:
            continue
        body[col] = val

    # JSON columns
    for col in spec.get("json_columns", []):
        raw = row.get(col)
        if raw is None or raw == "":
            continue
        try:
            body[col] = json.loads(raw) if isinstance(raw, str) else raw
        except (json.JSONDecodeError, TypeError):
            body[col] = raw

    # Remapped FK columns (still stored as a string field, just translated)
    for fk_col, target_table in (spec.get("_remap_fields") or {}).items():
        raw = row.get(fk_col)
        if not raw:
            continue
        new_id = id_map.get((target_table, raw))
        if not new_id:
            print(f"  ! {spec['pb_table']} row {row['id']}: skipping unmapped {fk_col}={raw}")
            continue
        body[fk_col] = new_id

    # created_by always points at the admin user
    if "created_by" in row and row["created_by"]:
        body["created_by"] = f"users/{admin_user_id}"

    # user_id passes through but rewritten to admin (for user_parent collections)
    if "user_id" in row and row["user_id"]:
        body["user_id"] = admin_user_id

    return body


def resolve_parent_chain(
    spec: dict[str, Any],
    row: dict[str, Any],
    id_map: dict[tuple[str, str], str],
    admin_user_id: str,
) -> list[str] | None:
    """Build the URL parent chain for a child resource. Returns None on miss."""
    if spec.get("user_parent"):
        return ["users", admin_user_id]

    parent_chain = spec.get("parent_chain") or []
    if not parent_chain:
        return None

    # Special case: perk_redemptions has parent_chain
    #   [(credit_cards, None), (credit_card_perks, perk)]
    # The first parent is implied by the second (perk → credit_card).
    if spec["pb_table"] == "perk_redemptions":
        perk_pb_id = row.get("perk")
        if not perk_pb_id:
            return None
        perk_aep_id = id_map.get(("credit_card_perks", perk_pb_id))
        if not perk_aep_id:
            return None
        # Look up the credit card via the perk's PB row, which we've already
        # processed. We stash perk → credit_card_pb_id in id_map under a
        # synthetic key during perk migration.
        card_pb_id = id_map.get(("credit_card_perks._parent", perk_pb_id))
        if not card_pb_id:
            return None
        card_aep_id = id_map.get(("credit_cards", card_pb_id))
        if not card_aep_id:
            return None
        return ["credit-cards", card_aep_id, "perks", perk_aep_id]

    # General case: each (parent_table, fk_col) pair maps to (plural, id).
    chain: list[str] = []
    for parent_table, fk_col in parent_chain:
        parent_pb_id = row.get(fk_col)
        if not parent_pb_id:
            return None
        parent_aep_id = id_map.get((parent_table, parent_pb_id))
        if not parent_aep_id:
            return None
        # We need the aepbase plural URL segment for the parent — look it up
        # in the spec list.
        parent_spec = next(
            (s for s in MIGRATION_SPECS if s["pb_table"] == parent_table), None,
        )
        if parent_spec is None:
            return None
        chain.extend([parent_spec["aep_plural"], parent_aep_id])
    return chain


def migrate_collection(
    spec: dict[str, Any],
    db_path: Path,
    pb_data_dir: Path,
    client: AepClient,
    id_map: dict[tuple[str, str], str],
    admin_user_id: str,
    skip_files: bool,
) -> tuple[int, int]:
    """Migrate one collection. Returns (success_count, error_count)."""
    table = spec["pb_table"]
    plural = spec["aep_plural"]
    rows = fetch_pb_rows(db_path, table)
    if not rows:
        print(f"  · {table}: empty, skipping")
        return 0, 0

    print(f"  → {table}: {len(rows)} rows")
    ok = 0
    err = 0

    for row in rows:
        try:
            body = build_body(spec, row, id_map, admin_user_id)
            if body is None:
                continue

            parent = resolve_parent_chain(spec, row, id_map, admin_user_id)
            if (spec.get("parent_chain") or spec.get("user_parent")) and parent is None:
                print(f"    ! {table} {row['id']}: missing parent, skipping")
                err += 1
                continue

            files: list[tuple[str, str, bytes]] = []
            file_fields = spec.get("file_fields") or []
            for field, required in file_fields:
                filename = row.get(field) or ""
                if not filename:
                    if required:
                        print(f"    ! {table} {row['id']}: required file {field} missing in DB, skipping")
                        err += 1
                        files = []
                        break
                    continue
                if skip_files:
                    continue
                pbc_id = spec.get("pb_collection")
                content = read_file_bytes(pb_data_dir, pbc_id, row["id"], filename) if pbc_id else None
                if content is None:
                    if required:
                        print(f"    ! {table} {row['id']}: required file {filename} missing on disk, skipping")
                        err += 1
                        files = []
                        break
                    print(f"    · {table} {row['id']}: optional file {filename} missing on disk, omitting")
                    continue
                files.append((field, filename, content))
            if file_fields and any(req for _, req in file_fields) and not files and not skip_files:
                # We already printed and incremented err above; just continue.
                continue

            created = client.create(plural, body, parent=parent, files=files or None)
            new_id = created.get("id") if isinstance(created, dict) else None
            if not new_id:
                raise RuntimeError(f"create returned no id: {created}")

            id_map[(table, row["id"])] = new_id

            # For credit_card_perks: also remember which credit_card the perk
            # belonged to in PB so perk_redemptions can resolve its grandparent.
            if table == "credit_card_perks" and row.get("credit_card"):
                id_map[("credit_card_perks._parent", row["id"])] = row["credit_card"]

            ok += 1
        except Exception as exc:
            err += 1
            print(f"    ! {table} {row.get('id', '?')}: {exc}")

    return ok, err


def patch_address_shared_data(
    db_path: Path,
    client: AepClient,
    id_map: dict[tuple[str, str], str],
) -> tuple[int, int]:
    """
    Second pass: addresses are created without `shared_data_id` (because the
    shared_data table doesn't exist yet at that point). Now that everything is
    migrated, PATCH each address that originally had a shared_data_id to fill
    it in with the new aepbase id.
    """
    rows = fetch_pb_rows(db_path, "addresses")
    rows = [r for r in rows if r.get("shared_data_id")]
    if not rows:
        return 0, 0
    print(f"  → addresses (second pass — shared_data_id): {len(rows)} rows")
    ok = 0
    err = 0
    for row in rows:
        try:
            aep_addr_id = id_map.get(("addresses", row["id"]))
            aep_shared_id = id_map.get(("person_shared_data", row["shared_data_id"]))
            if not aep_addr_id or not aep_shared_id:
                err += 1
                continue
            path = f"/addresses/{aep_addr_id}"
            req = urllib.request.Request(
                f"{client.base}{path}",
                data=json.dumps({"shared_data_id": aep_shared_id}).encode("utf-8"),
                method="PATCH",
                headers={
                    "Authorization": f"Bearer {client.token}",
                    "Content-Type": "application/merge-patch+json",
                },
            )
            if client.dry_run:
                print(f"    DRY PATCH {path} shared_data_id={aep_shared_id}")
            else:
                with urllib.request.urlopen(req) as resp:
                    resp.read()
            ok += 1
        except Exception as exc:
            err += 1
            print(f"    ! patching address {row['id']}: {exc}")
    return ok, err


def wipe_aepbase(client: AepClient) -> None:
    """Delete every record in every collection we know how to migrate."""
    print(":: wiping aepbase data...")

    # Delete in reverse dependency order: children first, then parents.
    wipe_order: list[tuple[str, list[str] | None]] = []

    for spec in reversed(_ordered_specs()):
        plural = spec["aep_plural"]
        if spec.get("user_parent"):
            # We don't know the user list at wipe time. List all users and
            # iterate. There should only be admin in test scenarios anyway.
            for user in client.list("users"):
                wipe_order.append((plural, ["users", user["id"]]))
        elif spec.get("parent_chain"):
            # Iterate parent records to find children. We resolve grandparents
            # too via the same recursive listing.
            _wipe_nested(client, spec, wipe_order)
        else:
            wipe_order.append((plural, None))

    for plural, parent in wipe_order:
        try:
            records = client.list(plural, parent=parent)
        except Exception as exc:
            print(f"  ! list {plural}: {exc}")
            continue
        if not records:
            continue
        path_label = "/".join(parent) + f"/{plural}" if parent else plural
        print(f"  - {path_label}: {len(records)}")
        for rec in records:
            try:
                client.remove(plural, rec["id"], parent=parent)
            except Exception as exc:
                print(f"    ! delete {rec['id']}: {exc}")


def _wipe_nested(
    client: AepClient,
    spec: dict[str, Any],
    out: list[tuple[str, list[str] | None]],
) -> None:
    """Walk parent records to enumerate every nested-resource path to wipe."""
    parent_chain = spec.get("parent_chain") or []
    if not parent_chain:
        out.append((spec["aep_plural"], None))
        return

    # Walk top-down: list parents, recurse for grandparents.
    def walk(idx: int, prefix: list[str]) -> None:
        if idx >= len(parent_chain):
            out.append((spec["aep_plural"], prefix or None))
            return
        parent_table, _ = parent_chain[idx]
        parent_spec = next(
            (s for s in MIGRATION_SPECS if s["pb_table"] == parent_table), None,
        )
        if parent_spec is None:
            return
        try:
            parents = client.list(parent_spec["aep_plural"], parent=prefix or None)
        except Exception:
            parents = []
        for p in parents:
            walk(idx + 1, prefix + [parent_spec["aep_plural"], p["id"]])

    walk(0, [])


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pb-data", required=True, type=Path,
                        help="Path to pb_data directory")
    parser.add_argument("--aep-url", default="http://localhost:8090",
                        help="aepbase base URL")
    parser.add_argument("--email", default="admin@example.com")
    parser.add_argument("--password", required=True,
                        help="aepbase superuser password")
    parser.add_argument("--wipe", action="store_true",
                        help="Delete existing aepbase records before importing")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print what would be done without writing")
    parser.add_argument("--collection", action="append", default=None,
                        help="Migrate only this PB table (can be repeated)")
    parser.add_argument("--no-files", action="store_true",
                        help="Skip file uploads (faster, schema-only test)")
    args = parser.parse_args()

    pb_data: Path = args.pb_data.expanduser().resolve()
    db_path = pb_data / "data.db"
    if not db_path.exists():
        print(f"error: {db_path} not found", file=sys.stderr)
        return 1

    print(f":: logging in to {args.aep_url} as {args.email}")
    try:
        token, admin_user_id = login(args.aep_url, args.email, args.password)
    except Exception as exc:
        print(f"error: login failed: {exc}", file=sys.stderr)
        return 1
    print(f":: admin user id = {admin_user_id}")

    client = AepClient(args.aep_url, token, dry_run=args.dry_run)

    if args.wipe:
        if args.dry_run:
            print(":: --wipe + --dry-run: skipping wipe (would delete records)")
        else:
            wipe_aepbase(client)

    id_map: dict[tuple[str, str], str] = {}
    totals_ok = 0
    totals_err = 0

    specs = _ordered_specs()
    if args.collection:
        wanted = set(args.collection)
        specs = [s for s in specs if s["pb_table"] in wanted]
        if not specs:
            print(f"error: no matching collections: {args.collection}", file=sys.stderr)
            return 1

    print(":: migrating...")
    for spec in specs:
        ok, err = migrate_collection(
            spec, db_path, pb_data, client, id_map, admin_user_id,
            skip_files=args.no_files,
        )
        totals_ok += ok
        totals_err += err

    # Second pass: patch addresses with shared_data_id (only if both addresses
    # and person_shared_data were migrated in this run).
    if not args.collection or (
        "addresses" in args.collection and "person_shared_data" in args.collection
    ):
        ok, err = patch_address_shared_data(db_path, client, id_map)
        totals_ok += ok
        totals_err += err

    print()
    print(f":: done. ok={totals_ok}  errors={totals_err}")
    return 0 if totals_err == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
