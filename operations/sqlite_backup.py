#!/usr/bin/env python3
"""Create and verify consistent, local SQLite backups (no production writes).

This tool does not upload backups or touch the running database's contents.
Copy successful snapshots to a separate, access-controlled location for DR.
"""

import argparse
import hashlib
import json
import os
import re
import sqlite3
import sys
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

MAGIC = b"SQLite format 3\x00"


def sha256_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def readonly_connection(path):
    uri = "file:" + quote(str(path), safe="/") + "?mode=ro"
    return sqlite3.connect(uri, uri=True, timeout=30)


def check_sqlite(path):
    if path.is_symlink() or not path.is_file():
        raise ValueError("Source must be an existing, regular SQLite file")
    with path.open("rb") as stream:
        if stream.read(16) != MAGIC:
            raise ValueError("File does not have a SQLite database header")
    con = readonly_connection(path)
    try:
        result = con.execute("PRAGMA integrity_check").fetchone()
        if not result or result[0] != "ok":
            raise RuntimeError("SQLite integrity check failed")
    finally:
        con.close()


def create_backup(source, destination, root):
    source = Path(source)
    root = Path(root).resolve(strict=True)
    if source.is_symlink():
        raise ValueError("Symlinked database sources are not permitted")
    source = source.resolve(strict=True)
    if not source.is_relative_to(root):
        raise ValueError("Source database is outside the allowed data root")
    check_sqlite(source)

    destination = Path(destination)
    if destination.is_symlink():
        raise ValueError("Symlinked backup destinations are not permitted")
    destination.mkdir(mode=0o700, parents=True, exist_ok=True)
    if not destination.is_dir():
        raise ValueError("Backup destination is not a directory")
    destination = destination.resolve(strict=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", source.stem)[:64] or "database"
    name = f"kader-{safe_name}-{stamp}-{uuid.uuid4().hex[:8]}.sqlite3"
    backup_path = destination / name
    manifest_path = destination / (name + ".json")

    fd, tmp_name = tempfile.mkstemp(prefix=".kader-sqlite-", suffix=".tmp", dir=destination)
    os.close(fd)
    tmp_path = Path(tmp_name)
    try:
        upstream = readonly_connection(source)
        snapshot = None
        try:
            snapshot = sqlite3.connect(str(tmp_path), timeout=30)
            upstream.backup(snapshot, pages=128, sleep=0.05)
        finally:
            if snapshot is not None:
                snapshot.close()
            upstream.close()
        check_sqlite(tmp_path)
        os.chmod(tmp_path, 0o600)
        os.replace(tmp_path, backup_path)
        info = {
            "format": "kader-sqlite-backup-v1",
            "created_utc": datetime.now(timezone.utc).isoformat(),
            "source_filename": source.name,
            "backup_filename": backup_path.name,
            "size_bytes": backup_path.stat().st_size,
            "sha256": sha256_file(backup_path),
            "sqlite_integrity": "ok",
            "offsite_copy_verified": False,
        }
        tmp_manifest = manifest_path.with_suffix(".json.tmp")
        try:
            with tmp_manifest.open("x", encoding="utf-8") as stream:
                os.chmod(tmp_manifest, 0o600)
                json.dump(info, stream, ensure_ascii=False, indent=2)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(tmp_manifest, manifest_path)
        finally:
            tmp_manifest.unlink(missing_ok=True)
        return {"backup_path": str(backup_path), "manifest_path": str(manifest_path), **info}
    finally:
        tmp_path.unlink(missing_ok=True)


def verify_backup(manifest):
    manifest = Path(manifest).resolve(strict=True)
    data = json.loads(manifest.read_text(encoding="utf-8"))
    if data.get("format") != "kader-sqlite-backup-v1":
        raise ValueError("Unsupported manifest format")
    name = data.get("backup_filename")
    if not isinstance(name, str) or name != Path(name).name or not name.endswith(".sqlite3"):
        raise ValueError("Unsafe backup filename")
    backup = manifest.parent / name
    check_sqlite(backup)
    if backup.stat().st_size != data.get("size_bytes"):
        raise RuntimeError("Backup size differs from manifest")
    if sha256_file(backup) != data.get("sha256"):
        raise RuntimeError("Backup SHA-256 differs from manifest")
    return {"verified": True, "backup_path": str(backup), "sha256": data["sha256"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--source", help="SQLite file inside --root")
    group.add_argument("--verify-manifest", help="Verify an existing snapshot and checksum")
    parser.add_argument("--dest", help="Private directory for new snapshots")
    parser.add_argument("--root", default="/data", help="Allowed source directory (default /data)")
    args = parser.parse_args()
    try:
        if args.source:
            if not args.dest:
                parser.error("--dest is required when creating a backup")
            result = create_backup(args.source, args.dest, args.root)
        else:
            result = verify_backup(args.verify_manifest)
        print(json.dumps(result, indent=2))
    except (OSError, ValueError, RuntimeError, sqlite3.Error) as exc:
        print("BACKUP FAILED: " + str(exc), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
