"""Conservative, repeatable repair of the known HR installer startup failure.

Does not alter records, roles or task workflow. Refuses to accept an unexpected
existing file. A DB backup and restore verification precede the code change.
"""
import ast
import gzip
import hashlib
import json
import os
from pathlib import Path
import shutil
import sqlite3
import tempfile

CSS_PATH = 'web/people-embedded.css'
CSS_SHA = 'bda4bf81c38c9d2f4df3901c6490cd72989ee90a958f3749039f2cc84e1cf2ab'
MARKER = '# KADER_IDEMPOTENT_HR_20261112'


def repair_installer(source):
    if MARKER in source:
        compile(source, '<hr-installer>', 'exec')
        return source
    tree = ast.parse(source)
    candidates = [n for n in ast.walk(tree) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == 'candidate']
    if len(candidates) != 1 or not candidates[0].args.args or candidates[0].args.args[0].arg != 'root':
        raise RuntimeError('Unexpected HR installer candidate contract; source review required')
    matches = []
    for node in ast.walk(candidates[0]):
        if not isinstance(node, ast.Raise) or not isinstance(node.exc, ast.Call):
            continue
        call = node.exc
        if not isinstance(call.func, ast.Name) or call.func.id != 'ValueError' or len(call.args) != 1:
            continue
        arg = call.args[0]
        if isinstance(arg, ast.BinOp) and isinstance(arg.op, ast.Add) and isinstance(arg.left, ast.Constant) and arg.left.value == 'New file already exists: ' and isinstance(arg.right, ast.Name) and arg.right.id == 'rel':
            matches.append(node)
    if len(matches) != 1:
        raise RuntimeError('Unexpected HR installer conflict check; source review required')
    node = matches[0]
    lines = source.splitlines(keepends=True)
    indent = ' ' * node.col_offset
    guard = (
        indent + MARKER + '\n' +
        indent + 'if rel == ' + repr(CSS_PATH) + ' and __import__("hashlib").sha256((root / rel).read_bytes()).hexdigest() == ' + repr(CSS_SHA) + ':\n' +
        indent + '    continue\n'
    )
    lines[node.lineno - 1] = guard + lines[node.lineno - 1]
    repaired = ''.join(lines)
    compile(repaired, '<hr-installer>', 'exec')
    return repaired


def verify_backup(database, backup_dir):
    backup_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='kader-repair-backup-') as temp:
        snapshot = Path(temp) / 'snapshot.sqlite3'
        with sqlite3.connect(database.as_uri() + '?mode=ro', uri=True) as live, sqlite3.connect(snapshot) as copy:
            live.backup(copy)
        packed = gzip.compress(snapshot.read_bytes(), mtime=0)
        digest = hashlib.sha256(packed).hexdigest()
        target = backup_dir / ('kader-before-startup-repair-' + digest[:16] + '.sqlite3.gz')
        if not target.exists():
            if shutil.disk_usage(backup_dir).free < len(packed) + 5 * 1024 * 1024:
                raise RuntimeError('Insufficient durable backup space')
            with target.open('xb') as output:
                output.write(packed)
            target.chmod(0o600)
        restored = Path(temp) / 'restored.sqlite3'
        restored.write_bytes(gzip.decompress(target.read_bytes()))
        if restored.read_bytes() != snapshot.read_bytes():
            raise RuntimeError('Backup restore bytes differ')
        with sqlite3.connect(restored) as connection:
            if connection.execute('pragma integrity_check').fetchone()[0] != 'ok':
                raise RuntimeError('Backup integrity check failed')
            if connection.execute('pragma foreign_key_check').fetchall():
                raise RuntimeError('Backup foreign key check failed')
    print(json.dumps({'stage':'startup-repair-backup-verified','backup':target.name}), flush=True)
    return target


def main():
    data = Path(os.environ.get('MOWAQQAT_DATA_DIR', '/data')).resolve()
    url = os.environ.get('DATABASE_URL', 'sqlite:///' + str(data / 'mowaqqat.sqlite3'))
    if not url.startswith('sqlite:///'):
        raise RuntimeError('Expected existing durable SQLite deployment')
    database = Path(url.removeprefix('sqlite:///')).resolve()
    if not database.is_relative_to(data) or not database.is_file():
        raise RuntimeError('Existing database unavailable; refusing to create a replacement')
    installer = Path('/data/kader-releases/hr-native-integration-20261108/apply.py')
    original = installer.read_text()
    repaired = repair_installer(original)
    verify_backup(database, data / 'backups')
    if repaired != original:
        backup = installer.with_name('apply.before-' + hashlib.sha256(original.encode()).hexdigest()[:16] + '.py')
        if not backup.exists():
            shutil.copy2(installer, backup)
        temporary = installer.with_suffix('.repair.tmp')
        temporary.write_text(repaired)
        shutil.copystat(installer, temporary)
        os.replace(temporary, installer)
    print(json.dumps({'stage':'startup-hr-idempotence-repaired','revision':'20261112.1'}), flush=True)
    start = Path('/data/kader-releases/2.9.0-task-workflow-20261108/start.py')
    exec(compile(start.read_text(), str(start), 'exec'), {'__name__':'__main__','__file__':str(start)})


if __name__ == '__main__':
    main()
