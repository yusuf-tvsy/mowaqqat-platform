import tempfile
import unittest
from pathlib import Path
from tools.check_site import audit, linked_file


GOOD = '''<!doctype html><html lang="ar" dir="rtl"><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="Research website">
<title>Research center</title><link rel="icon" href="./assets/favicon.png">
</head><body><img src="./assets/logo.png" alt="Logo">
<a href="/research/example/">Research</a>
<a href="https://example.org">External link</a>
<script>const source = '<a href="/not-a-real-link/">dynamic</a>';</script>
</body></html>'''


class WebsiteQualityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "index.html").write_text(GOOD, encoding="utf-8")
        (self.root / "assets").mkdir()
        for name in ("logo.png", "favicon.png"):
            (self.root / "assets" / name).write_bytes(b"image-placeholder")
        (self.root / "research" / "example").mkdir(parents=True)
        (self.root / "research" / "example" / "index.html").write_text("research", encoding="utf-8")

    def test_good_site_passes(self):
        result = audit(self.root)
        self.assertTrue(result["ok"], result)
        self.assertEqual(result["local_references_checked"], 3)

    def test_missing_asset_detected(self):
        (self.root / "assets" / "favicon.png").unlink()
        result = audit(self.root)
        self.assertFalse(result["ok"])
        self.assertTrue(any("favicon" in x for x in result["issues"]))

    def test_missing_arabic_direction_detected(self):
        html = GOOD.replace('dir="rtl"', 'dir="ltr"')
        (self.root / "index.html").write_text(html, encoding="utf-8")
        self.assertFalse(audit(self.root)["ok"])

    def test_missing_alt_detected(self):
        html = GOOD.replace('alt="Logo"', '')
        (self.root / "index.html").write_text(html, encoding="utf-8")
        self.assertTrue(any("alt" in x for x in audit(self.root)["issues"]))

    def test_missing_root_index_detected(self):
        (self.root / "index.html").unlink()
        self.assertEqual(audit(self.root)["issues"], ["Missing index.html"])

    def test_url_traversal_refused(self):
        path, error = linked_file(self.root, "../secret.txt")
        self.assertIsNone(path)
        self.assertIsNotNone(error)

    def test_empty_site_metadata_detected(self):
        (self.root / "index.html").write_text('<html lang="ar" dir="rtl"><title></title></html>', encoding="utf-8")
        self.assertFalse(audit(self.root)["ok"])


if __name__ == "__main__":
    unittest.main()
