import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from sqlite_backup import create_backup, verify_backup, check_sqlite


class BackupTests(unittest.TestCase):
    def setUp(self):
        self.work = tempfile.TemporaryDirectory()
        self.addCleanup(self.work.cleanup)
        self.root = Path(self.work.name) / "data"
        self.root.mkdir()
        self.source = self.root / "test.sqlite3"
        con = sqlite3.connect(self.source)
        con.execute("CREATE TABLE tasks(id INTEGER PRIMARY KEY, title TEXT)")
        con.execute("INSERT INTO tasks(title) VALUES('test record')")
        con.commit()
        con.close()
        self.backups = Path(self.work.name) / "private_backups"

    def test_online_backup_and_restore_validation(self):
        artifact = create_backup(self.source, self.backups, self.root)
        manifest = Path(artifact["manifest_path"])
        self.assertEqual(verify_backup(manifest)["verified"], True)
        con = sqlite3.connect(artifact["backup_path"])
        self.assertEqual(con.execute("SELECT title FROM tasks").fetchone()[0], "test record")
        con.close()
        self.assertEqual(Path(artifact["backup_path"]).stat().st_mode & 0o777, 0o600)
        self.assertFalse(json.loads(manifest.read_text())["offsite_copy_verified"])

    def test_tampered_checksum_is_detected(self):
        artifact = create_backup(self.source, self.backups, self.root)
        manifest = Path(artifact["manifest_path"])
        data = json.loads(manifest.read_text())
        data["sha256"] = "0" * 64
        manifest.write_text(json.dumps(data))
        with self.assertRaisesRegex(RuntimeError, "SHA-256"):
            verify_backup(manifest)

    def test_disallow_source_outside_data_root(self):
        other_root = Path(self.work.name) / "different_root"
        other_root.mkdir()
        with self.assertRaisesRegex(ValueError, "outside"):
            create_backup(self.source, self.backups, other_root)

    def test_reject_non_sqlite_source(self):
        invalid = self.root / "invalid.db"
        invalid.write_text("not a database")
        with self.assertRaisesRegex(ValueError, "SQLite database header"):
            create_backup(invalid, self.backups, self.root)

    def test_source_database_is_not_mutated(self):
        original = self.source.read_bytes()
        create_backup(self.source, self.backups, self.root)
        self.assertEqual(original, self.source.read_bytes())
        check_sqlite(self.source)


if __name__ == "__main__":
    unittest.main()
