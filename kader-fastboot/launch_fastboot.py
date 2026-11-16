"""Optional fail-closed Railway fast boot launcher. DO NOT deploy without a new verified backup.

This wraps the existing release start.py without changing production data or
environment values. All intercepted commands fall back to the original on
cache miss, corruption, dependency mismatch or an explicit opt-out.
"""
from pathlib import Path
import runpy
import subprocess

from fastboot_guard import install_guard

START = Path("/data/kader-releases/2.9.0-task-workflow-20261108/start.py")
if not START.is_file():
    raise SystemExit("KADER_FASTBOOT_ABORT: the verified original launcher is missing")

_original_run = install_guard()
try:
    runpy.run_path(str(START), run_name="__main__")
finally:
    subprocess.run = _original_run
