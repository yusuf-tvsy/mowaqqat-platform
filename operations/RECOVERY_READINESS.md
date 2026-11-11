# Kader production recovery readiness (30 October 2026)

## Scope and current facts
- The Railway project **Kader - Access Gateway** has a **production** environment.
- Its core service `mowaqqat-full` runs a Python 3.12 image, with a persistent `/data` volume.
- The live start command loads application code from Railway environment variables. The available GitHub repository does **not** yet represent the complete runnable backend.
- The service has `DATABASE_URL` and `STORAGE_DRIVER` variable **names**, but their **values are redacted** through OAuth. Consequently, the active database engine is **not proven** to be SQLite.
- The separate Marsad project includes PostgreSQL in staging. Do not assume that it shares the Kader data store.
- **No production data backup, offsite copy, or successful full-system restore has been established by this repository change.**

## Backup decision tree
1. Identify the active storage backend without printing credentials or personal records.
2. If SQLite is confirmed and its source file is under `/data`, use `operations/sqlite_backup.py` inside a controlled environment with access to the mounted volume.
3. If PostgreSQL is active, use a consistent PostgreSQL backup (for example `pg_dump -Fc`) to private storage instead. Do **not** pass PostgreSQL data to the SQLite script.
4. Keep snapshots **outside the production volume**, in a private, access-controlled backup location; a second file on the same volume does not protect against volume loss.
5. Validate checksums and restore into an **isolated test environment**, never over the production database.
6. Capture evidence of source, timestamp, checksum, snapshot location, test-restore result, responsible operator, and expiry.

## SQLite utility
The Python 3.12+ utility:
- Only reads the live source using SQLite's read-only connection and online backup API.
- Refuses sources outside the specified data root.
- Refuses symlinked sources and non-SQLite headers.
- Runs SQLite integrity checks on source and backup.
- Writes a separate SHA-256 JSON manifest and restricts backup file permissions to owner-only.
- Supports later verification via `--verify-manifest`.
- Does **not** upload, encrypt, or schedule offsite copies. The manifest deliberately states `offsite_copy_verified: false`.

Example **after** verifying the actual SQLite file and providing the script inside the running service:

```sh
python3 operations/sqlite_backup.py --root /data --source /data/ACTUAL_DATABASE.sqlite3 --dest /safe/private/backup-directory
python3 operations/sqlite_backup.py --verify-manifest /safe/private/backup-directory/ACTUAL_BACKUP.sqlite3.json
```

These are templates, **not executable commands for the currently deployed container**: this branch does not install `operations/` into that container, and the actual database filename is not yet known.

## Release blockers (all must pass)
- [ ] Verify live database engine without exposing `DATABASE_URL`.
- [ ] Establish an automatic or manual production snapshot with timestamp.
- [ ] Confirm an independent private offsite copy, with access controls and encryption.
- [ ] Execute a successful isolated restore rehearsal and check application data integrity.
- [ ] Export backend source without secrets into a **private** version-controlled repository.
- [ ] Compare deployed app build with reproducible source.
- [ ] Run end-to-end tests for role permissions, task changes, HR/CV data, finance, reports, and cross-company isolation.
- [ ] Confirm change, incident, and rollback procedures before release.

## Non-destructive local tests
```sh
python3 -m unittest discover -s operations -p 'test_sqlite_backup.py' -v
node --test kader-apex/gateway.test.mjs
```

**Security:** Never commit database snapshots, `/data` contents, environment variable values, access tokens, resumes, or HR/financial records into this **public GitHub repository**. Never run a restore against production.
