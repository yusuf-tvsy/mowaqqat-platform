import copy
import json
import tempfile
import unittest
from pathlib import Path
from web_foundry.foundry import REQUIRED_GATES, audit_site, init_site, release_gate


class FoundryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.site = Path(self.tmp.name) / "site"
        self.manifest = init_site("demo-site", "الموقع التجريبي", self.site)

    def test_init_arabic_and_site_assets(self):
        content = (self.site / "index.html").read_text(encoding="utf-8")
        self.assertIn('lang="ar" dir="rtl"', content)
        self.assertIn("الموقع التجريبي", content)
        self.assertTrue((self.site / "style.css").is_file())
        self.assertTrue((self.site / "project.json").is_file())

    def test_safe_html_escaping(self):
        sub = Path(self.tmp.name) / "other"
        init_site("other-site", "<script>hi</script>", sub)
        c = (sub / "index.html").read_text(encoding="utf-8")
        self.assertNotIn("<script>hi</script>", c)
        self.assertIn("&lt;script&gt;", c)

    def test_refuse_unsafe_slug(self):
        for slug in ("../bad", "UPPER", "a", "abc space", "/tmp/hack"):
            with self.subTest(slug=slug):
                with self.assertRaises(ValueError):
                    init_site(slug, "title", Path(self.tmp.name) / "bad")

    def test_refuse_overwrite(self):
        with self.assertRaises(FileExistsError):
            init_site("demo-site", "new title", self.site)

    def test_audit_passes_sample(self):
        r = audit_site(self.site)
        self.assertTrue(r["ok"], r)
        self.assertGreaterEqual(r["references_checked"], 1)

    def test_audit_missing_style(self):
        (self.site / "style.css").unlink()
        r = audit_site(self.site)
        self.assertFalse(r["ok"])
        self.assertIn("Missing local reference: ./style.css", r["issues"])

    def test_audit_missing_anchor(self):
        p = self.site / "index.html"
        p.write_text(p.read_text(encoding="utf-8").replace('id="services"', 'id="unknown"'), encoding="utf-8")
        self.assertIn("Broken anchor: #services", audit_site(self.site)["issues"])

    def test_audit_wrong_rtl(self):
        p = self.site / "index.html"
        p.write_text(p.read_text(encoding="utf-8").replace('dir="rtl"','dir="ltr"'), encoding="utf-8")
        self.assertIn("Missing dir=rtl", audit_site(self.site)["issues"])

    def test_audit_bad_resource_traversal(self):
        p = self.site / "index.html"
        p.write_text(p.read_text(encoding="utf-8").replace('./style.css', '../private.env'), encoding="utf-8")
        self.assertIn("Unsafe relative path: ../private.env", audit_site(self.site)["issues"])

    def test_audit_javascript_url(self):
        p = self.site / "index.html"
        p.write_text(p.read_text(encoding="utf-8").replace('href="#services"', 'href="javascript:alert(1)"'), encoding="utf-8")
        self.assertTrue(any("Unsafe javascript URL" in v for v in audit_site(self.site)["issues"]))

    def test_audit_bad_title(self):
        p = self.site / "index.html"
        p.write_text(p.read_text(encoding="utf-8").replace('<title>الموقع التجريبي</title>', '<title></title>'), encoding="utf-8")
        self.assertIn("Missing title", audit_site(self.site)["issues"])

    def test_gate_denies_default(self):
        r = release_gate(self.manifest)
        self.assertFalse(r["allowed_by_manifest"])
        self.assertEqual(r["status"], "BLOCKED")

    def test_gate_denies_sensitive_public(self):
        m = copy.deepcopy(self.manifest)
        m["target"] = "production"
        m["data_class"] = "restricted-minors"
        m["repository_visibility"] = "public"
        self.assertIn("Sensitive source requires private repository", release_gate(m)["issues"])

    def test_gate_denies_missing_evidence_ref(self):
        m = copy.deepcopy(self.manifest)
        m["target"] = "production"
        m["source_revision"] = "d" * 40
        for k in REQUIRED_GATES: m["evidence"][k] = {"verified":True,"reference":None}
        self.assertFalse(release_gate(m)["allowed_by_manifest"])

    def test_gate_ready_only_as_self_report(self):
        m = copy.deepcopy(self.manifest)
        m["target"] = "production"
        m["repository_visibility"] = "private"
        m["source_revision"] = "a" * 40
        for k in REQUIRED_GATES: m["evidence"][k] = {"verified":True,"reference":"https://example.invalid/evidence"}
        result = release_gate(m)
        self.assertTrue(result["allowed_by_manifest"])
        self.assertEqual(result["status"], "READY_FOR_EXTERNAL_APPROVAL")
        self.assertIn("independent", result["caution"])

    def test_manifest_does_not_contain_credentials(self):
        m = json.loads((self.site / "project.json").read_text(encoding="utf-8"))
        self.assertNotIn("password", json.dumps(m).lower())
        self.assertNotIn("secret", json.dumps(m).lower())


if __name__ == "__main__":
    unittest.main()
