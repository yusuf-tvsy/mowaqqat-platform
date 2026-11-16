"""No Railway network or production filesystem access in this test suite."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

from fastboot_guard import VerifiedCache, CACHE_NAME, _which_interpreter

class FakeRunner:
    def __init__(self):
        self.calls = []
        self.pip_check_status = 0
        self.pip_install_status = 0

    def __call__(self, cmd, *args, **kwargs):
        cmd = list(cmd) if isinstance(cmd, (list, tuple)) else cmd
        self.calls.append((cmd, kwargs))
        if isinstance(cmd, list) and cmd[1:4] == ["-m", "pip", "check"]:
            return subprocess.CompletedProcess(cmd, self.pip_check_status)
        if isinstance(cmd, list) and cmd[1:4] == ["-m", "pip", "install"]:
            return subprocess.CompletedProcess(cmd, self.pip_install_status)
        return subprocess.CompletedProcess(cmd, 0)

    def count(self, kind):
        return sum(1 for x, _ in self.calls if isinstance(x, list)
                   and (x[1:3] == ["-m", "venv"] if kind == "venv"
                        else x[1:4] == ["-m", "pip", kind]))

class CachedLaunchTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="kader-fastboot-test-")
        self.addCleanup(self.tmp.cleanup)
        base = Path(self.tmp.name)
        self.runtime = base / "kader-runtime-5bc4af9d20043af9"
        self.source = base / "kader-source-5bc4af9d20043af9"
        self.runtime.mkdir()
        self.source.mkdir()
        (self.runtime / "pyvenv.cfg").write_text("home = python\n", encoding="utf-8")
        py = _which_interpreter(self.runtime)
        py.parent.mkdir(parents=True)
        py.write_text("python-placeholder", encoding="utf-8")
        self.py = str(py)
        self.req = self.source / "requirements.txt"
        self.req.write_text("fastapi==0.128.2\nuvicorn==0.48.0\n", encoding="utf-8")
        self.fake = FakeRunner()
        self.guard = VerifiedCache(original_run=self.fake)
        self.venv = [self.py, "-m", "venv", str(self.runtime)]
        self.pip = [self.py, "-m", "pip", "install", "--no-cache-dir",
                    "--disable-pip-version-check", "-r", str(self.req)]

    def warm_cache(self):
        self.assertEqual(self.guard.run(self.pip, check=True).returncode, 0)
        self.assertTrue((self.runtime / CACHE_NAME).is_file())

    def test_initial_install_is_not_skipped(self):
        self.guard.run(self.venv, check=True)
        self.guard.run(self.pip, check=True)
        self.assertEqual(self.fake.count("venv"), 1)
        self.assertEqual(self.fake.count("install"), 1)

    def test_subsequent_wake_skips_venv_and_pip_with_pip_check(self):
        self.warm_cache()
        self.guard.run(self.venv, check=True)
        self.guard.run(self.pip, check=True)
        self.assertEqual(self.fake.count("venv"), 0)
        self.assertEqual(self.fake.count("install"), 1)
        self.assertEqual(self.fake.count("check"), 2)

    def test_requirements_change_invalidates_cache(self):
        self.warm_cache()
        self.req.write_text(self.req.read_text() + "Pillow>=11,<13\n")
        self.guard.run(self.pip, check=True)
        self.assertEqual(self.fake.count("install"), 2)

    def test_missing_interpreter_never_skips_venv(self):
        self.warm_cache()
        _which_interpreter(self.runtime).unlink()
        self.guard.run(self.venv, check=True)
        self.assertEqual(self.fake.count("venv"), 1)

    def test_pip_check_failure_forces_regular_install(self):
        self.warm_cache()
        self.fake.pip_check_status = 1
        self.guard.run(self.pip, check=True)
        self.assertEqual(self.fake.count("install"), 2)
        self.assertEqual(self.fake.count("check"), 1)

    def test_failed_pip_install_does_not_create_marker(self):
        self.fake.pip_install_status = 1
        result = self.guard.run(self.pip, check=False)
        self.assertEqual(result.returncode, 1)
        self.assertFalse((self.runtime / CACHE_NAME).exists())

    def test_unrelated_commands_always_execute(self):
        self.warm_cache()
        command = [self.py, "-m", "pip", "install", "-r", "another-requirements.txt"]
        self.guard.run(command, check=True)
        self.assertEqual(len([x for x, _ in self.fake.calls if x == command]), 1)

    def test_environment_override_does_not_skip(self):
        self.warm_cache()
        self.guard.run(self.pip, check=True, env={"PYTHONPATH":"custom"})
        self.assertEqual(self.fake.count("install"), 2)

    def test_disabled_guard_does_not_skip(self):
        self.warm_cache()
        off = VerifiedCache(original_run=self.fake, disabled=True)
        off.run(self.venv, check=True)
        off.run(self.pip, check=True)
        self.assertEqual(self.fake.count("venv"), 1)
        self.assertEqual(self.fake.count("install"), 2)

if __name__ == "__main__":
    unittest.main(verbosity=2)
