import hashlib
from pathlib import Path
import runpy
import sqlite3
import tempfile
import unittest

repair = runpy.run_path(str(Path(__file__).with_name('startup-repair.py')))


class StartupRepairTests(unittest.TestCase):
    def test_repeated_install_keeps_identical_existing_css_and_rejects_different_bytes(self):
        fixture = '''from pathlib import Path
def candidate(root):
    prepared=[]
    for rel in ['web/people-embedded.css']:
        if (root / rel).exists():
            raise ValueError('New file already exists: '+rel)
        prepared.append(rel)
    return prepared
'''
        source = repair['repair_installer'](fixture)
        self.assertEqual(repair['repair_installer'](source), source)
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            css = root / repair['CSS_PATH']
            css.parent.mkdir()
            # Pin only the fixture's guard to its invented fixture bytes.
            data = b'fixture CSS'
            fixture_source = source.replace(repair['CSS_SHA'], hashlib.sha256(data).hexdigest())
            namespace = {}
            exec(compile(fixture_source, '<fixture>', 'exec'), namespace)
            self.assertEqual(namespace['candidate'](root), [repair['CSS_PATH']])
            css.write_bytes(data)
            self.assertEqual(namespace['candidate'](root), [])
            self.assertEqual(namespace['candidate'](root), [])
            css.write_bytes(b'changed CSS')
            with self.assertRaisesRegex(ValueError, 'New file already exists'):
                namespace['candidate'](root)

    def test_unknown_installer_is_rejected(self):
        with self.assertRaises(RuntimeError):
            repair['repair_installer']('def candidate(root):\n    return []\n')

    def test_backup_restores_database_without_changing_original(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            database = root / 'original.sqlite3'
            with sqlite3.connect(database) as connection:
                connection.execute('create table records(id integer primary key, value text)')
                connection.execute('insert into records values (1, ?)', ('fixture',))
            before = database.read_bytes()
            backup = repair['verify_backup'](database, root / 'backups')
            self.assertTrue(backup.is_file())
            self.assertEqual(before, database.read_bytes())


if __name__ == '__main__':
    unittest.main()
