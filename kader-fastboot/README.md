# Kader FastBoot — offline candidate only

**Not deployed to Railway.** This is an additive, opt-out-capable optimization candidate for an existing Python launcher. It does not contain the private Kader application source, credentials, database, or attachments.

`fastboot_guard.py` intercepts only recognized `python -m venv` and `python -m pip install -r requirements.txt` subprocess invocations for matched Kader source/runtime folders. It skips work only after a prior successful install, an unchanged requirements hash and Python executable metadata, a matching `pip list --format=freeze` inventory, and a successful `pip check`. Otherwise it runs the original command. Set `KADER_FASTBOOT_DISABLED=1` to disable the optimization.

`launch_fastboot.py` is a candidate wrapper for the existing release's `start.py`, not a replacement for its content. **Do not use it in production** until the exact current launcher hash and nested subprocess contract have been inspected via authenticated access, the backup is independently recoverable, and a staging restore and real cold-start tests pass.

### Test locally

```sh
python kader-fastboot/test_fastboot_guard.py
```

GitHub Actions runs the tests on both Linux and Windows, using simulated requirements and **no production data**.

### Gate before deployment

1. Use official Railway CLI authentication; verify target project, service, and environment.
2. Read the current live launcher; compare its SHA-256 to an approved baseline (archival copies alone are insufficient).
3. Verify a *new* off-volume SQLite Online Backup plus attachments archive by isolated restore. Do not rely solely on historical backups.
4. Check whether the Python virtual environment survives the specific sleep/wake lifecycle. If the runtime is recreated on every wake, this optimization will not improve those cold starts; prefer image prebuilding.
5. Test cold/warm starts, health endpoints, login/session/logout, HR, tasks, file operations and DB integrity in staging with isolated data.
6. Deploy with zero schema/data changes and an immediate rollback to the original start command. Measure before/after readiness and 5xx across a meaningful sample.

**No production changes** are carried out by GitHub CI or files in this branch.
