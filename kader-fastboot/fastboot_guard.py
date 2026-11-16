"""Fail-closed cache for an existing Kader Python venv during Railway app wakeups.

Offline candidate only. It does not edit source, credentials, /data or the database.
Call install_guard() before executing the *verified* existing production start.py.
"""
from __future__ import annotations
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

CACHE_NAME = ".kader-verified-deps-v1.json"
RUNTIME_PATTERN = re.compile(r"kader-runtime-([a-f0-9]{16})$")
REQUIREMENTS_NAME = "requirements.txt"

def _which_interpreter(runtime: Path) -> Path:
    return runtime / ("Scripts/python.exe" if os.name == "nt" else "bin/python")

def _details(runtime: Path) -> dict | None:
    match = RUNTIME_PATTERN.fullmatch(runtime.name)
    if match is None:
        return None
    source = runtime.with_name("kader-source-" + match.group(1))
    requirements = source / REQUIREMENTS_NAME
    python = _which_interpreter(runtime)
    if not (requirements.is_file() and python.is_file()
            and (runtime / "pyvenv.cfg").is_file()):
        return None
    stat = python.stat()
    return {
        "version": 1,
        "requirements_sha256": hashlib.sha256(requirements.read_bytes()).hexdigest(),
        "python_path": str(python.resolve()),
        "python_size": stat.st_size,
        "python_mtime_ns": stat.st_mtime_ns,
    }

def _safe_args(command) -> list[str] | None:
    if not isinstance(command, (list, tuple)) or not command:
        return None
    return list(command) if all(isinstance(x, str) for x in command) else None

def _classify(args: list[str]) -> tuple[str, Path] | None:
    if (len(args) == 4 and args[1:3] == ["-m", "venv"]
            and RUNTIME_PATTERN.fullmatch(Path(args[3]).name)):
        return ("venv", Path(args[3]))
    if (len(args) >= 7 and args[1:4] == ["-m", "pip", "install"]
            and "-r" in args):
        idx = args.index("-r")
        if idx + 1 >= len(args):
            return None
        req = Path(args[idx + 1])
        source_match = re.fullmatch(r"kader-source-([a-f0-9]{16})", req.parent.name)
        if req.name != "requirements.txt" or not source_match:
            return None
        runtime = req.parent.with_name("kader-runtime-" + source_match.group(1))
        if Path(args[0]).resolve() != _which_interpreter(runtime).resolve():
            return None
        return ("pip", runtime)
    return None

class VerifiedCache:
    def __init__(self, original_run=subprocess.run, disabled=False):
        self.original_run = original_run
        self.disabled = disabled

    def _installed_snapshot(self, runtime: Path) -> str | None:
        """Detect package drift that `pip check` alone would not catch."""
        try:
            python = _which_interpreter(runtime)
            result = self.original_run(
                [str(python), "-m", "pip", "list", "--format=freeze"],
                capture_output=True, timeout=20, check=False,
            )
            output = result.stdout
            if result.returncode != 0 or not isinstance(output, (bytes, str)) or not output:
                return None
            raw = output.encode("utf-8") if isinstance(output, str) else output
            if len(raw) > 2_000_000:
                return None
            return hashlib.sha256(raw).hexdigest()
        except (OSError, ValueError, subprocess.SubprocessError):
            return None

    def _cache_valid(self, runtime: Path) -> bool:
        marker = runtime / CACHE_NAME
        if not marker.is_file():
            return False
        try:
            expected = _details(runtime)
            if expected is None:
                return False
            stored = json.loads(marker.read_text(encoding="utf-8"))
            if not isinstance(stored, dict):
                return False
            saved_snapshot = stored.pop("installed_freeze_sha256", None)
            if saved_snapshot is None or stored != expected:
                return False
            python = _which_interpreter(runtime)
            result = self.original_run([str(python), "-m", "pip", "check"],
                                       capture_output=True, timeout=15, check=False)
            return result.returncode == 0 and self._installed_snapshot(runtime) == saved_snapshot
        except (OSError, ValueError, json.JSONDecodeError, subprocess.SubprocessError):
            return False

    def _mark_valid(self, runtime: Path) -> None:
        info = _details(runtime)
        if info is None:
            return
        snapshot = self._installed_snapshot(runtime)
        if snapshot is None:
            return
        info["installed_freeze_sha256"] = snapshot
        marker = runtime / CACHE_NAME
        tmpname = None
        try:
            with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", prefix=".kader-deps-",
                                             suffix=".partial", dir=runtime, delete=False) as f:
                tmpname = f.name
                os.chmod(f.name, 0o600)
                json.dump(info, f, sort_keys=True)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmpname, marker)
        except OSError:
            pass
        finally:
            if tmpname and os.path.exists(tmpname):
                os.unlink(tmpname)

    def run(self, command, *args, **kwargs):
        argv = _safe_args(command)
        # No interception of environment overrides or shell commands.
        if (self.disabled or os.environ.get("KADER_FASTBOOT_DISABLED") == "1"
                or argv is None or args or kwargs.get("env") is not None
                or kwargs.get("shell", False)):
            return self.original_run(command, *args, **kwargs)
        classification = _classify(argv)
        if classification is None:
            return self.original_run(command, *args, **kwargs)
        kind, runtime = classification
        if self._cache_valid(runtime):
            print("KADER_FASTBOOT_HIT " + kind, flush=True)
            return subprocess.CompletedProcess(argv, 0)
        result = self.original_run(command, *args, **kwargs)
        if kind == "pip" and getattr(result, "returncode", 1) == 0:
            self._mark_valid(runtime)
        return result

def install_guard():
    original = subprocess.run
    cache = VerifiedCache(original_run=original)
    subprocess.run = cache.run
    return original
