#!/usr/bin/env python3
"""Safe, offline starter for Arabic static sites; never deploys or accesses secrets."""
import argparse
from html import escape
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import shutil
import sys
from urllib.parse import unquote, urlsplit

HERE = Path(__file__).resolve().parent
SLUG = re.compile(r"^[a-z][a-z0-9-]{2,39}$")
REQUIRED_GATES = (
    "source_verified", "ci_passed", "staging_verified", "security_reviewed",
    "rollback_tested", "approval_recorded", "data_recovery_verified"
)

class Inspector(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.html_attrs = {}; self.title = ""; self._in_title = False
        self.viewport = False; self.description = False; self.h1_count = 0
        self.refs = []; self.anchors = set(); self.images_missing_alt = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "html": self.html_attrs = a
        if tag == "title": self._in_title = True
        if tag == "h1": self.h1_count += 1
        if tag == "meta":
            self.viewport |= a.get("name") == "viewport" and bool(a.get("content"))
            self.description |= a.get("name") == "description" and bool(a.get("content"))
        if "id" in a: self.anchors.add(a["id"])
        if tag == "img" and "alt" not in a: self.images_missing_alt.append(a.get("src", "<unknown>"))
        if tag in {"a", "link", "img", "source", "script"}:
            val = a.get("href") or a.get("src")
            if val: self.refs.append(val)

    def handle_endtag(self, tag):
        if tag == "title": self._in_title = False

    def handle_data(self, data):
        if self._in_title: self.title += data


def init_site(slug: str, title: str, out: Path):
    if not SLUG.fullmatch(slug): raise ValueError("Invalid slug; use lowercase letters, digits and hyphens")
    if not (1 <= len(title.strip()) <= 80): raise ValueError("Title must be 1-80 characters")
    if out.exists(): raise FileExistsError("Destination exists; refusing to overwrite")
    template = HERE / "templates" / "arabic_static"
    shutil.copytree(template, out)
    index = out / "index.html"
    index.write_text(index.read_text(encoding="utf-8").replace("SITE_TITLE", escape(title.strip())), encoding="utf-8")
    manifest = {
        "schema_version": 1, "project_id": slug, "public_url": None,
        "data_class": "public", "data_mode": "stateless", "target": "staging",
        "repository_visibility": "unverified", "source_revision": None,
        "evidence": {k: {"verified": False, "reference": None} for k in REQUIRED_GATES},
        "warning": "Sample only. Never treat manually edited evidence flags as provider verification."
    }
    (out / "project.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return manifest


def audit_site(root: Path):
    root = root.resolve(); index = root / "index.html"
    if not index.is_file(): return {"ok": False, "issues": ["Missing index.html"], "references_checked": 0}
    p = Inspector(); p.feed(index.read_text(encoding="utf-8"))
    issues = []
    if p.html_attrs.get("lang") != "ar": issues.append("Missing lang=ar")
    if p.html_attrs.get("dir") != "rtl": issues.append("Missing dir=rtl")
    if not p.title.strip(): issues.append("Missing title")
    if not p.viewport: issues.append("Missing viewport meta")
    if not p.description: issues.append("Missing description meta")
    if p.h1_count != 1: issues.append("Expected exactly one h1")
    for x in p.images_missing_alt: issues.append(f"Image missing alt: {x}")
    seen = 0
    for ref in p.refs:
        if ref.lower().startswith("javascript:"):
            issues.append(f"Unsafe javascript URL: {ref}"); continue
        if ref.startswith("#"):
            if ref[1:] and ref[1:] not in p.anchors: issues.append(f"Broken anchor: {ref}")
            continue
        if ref.startswith("//"): continue
        url = urlsplit(ref)
        if url.scheme or url.netloc or not url.path: continue
        path = unquote(url.path).lstrip("/")
        target = (root / (path or "index.html")).resolve()
        if not target.is_relative_to(root):
            issues.append(f"Unsafe relative path: {ref}"); continue
        if path.endswith("/") or target.is_dir(): target = target / "index.html"
        seen += 1
        if not target.is_file(): issues.append(f"Missing local reference: {ref}")
    return {"ok": not issues, "issues": sorted(set(issues)), "references_checked": seen}


def release_gate(manifest):
    issues = []
    if manifest.get("schema_version") != 1: issues.append("Unsupported schema version")
    if manifest.get("target") != "production": issues.append("Not a production release manifest")
    if manifest.get("data_class") in {"internal", "confidential", "restricted-minors"} and manifest.get("repository_visibility") != "private":
        issues.append("Sensitive source requires private repository")
    if not manifest.get("source_revision"): issues.append("No verified source revision")
    evidence = manifest.get("evidence", {})
    for item in REQUIRED_GATES:
        gate = evidence.get(item, {})
        if gate.get("verified") is not True or not isinstance(gate.get("reference"), str) or not gate.get("reference", "").startswith("https://"):
            issues.append("Missing verifiable evidence: " + item)
    return {"allowed_by_manifest": not issues, "status": "READY_FOR_EXTERNAL_APPROVAL" if not issues else "BLOCKED", "issues": issues,
            "caution": "Manifest assertions are not proof; production requires independent provider-side verification and approval."}


def main(argv=None):
    ap = argparse.ArgumentParser(description="Offline Arabic site foundry; never deploys")
    sub = ap.add_subparsers(dest="command", required=True)
    a = sub.add_parser("init"); a.add_argument("--slug", required=True); a.add_argument("--title", required=True); a.add_argument("--out", type=Path, required=True)
    a = sub.add_parser("audit"); a.add_argument("--site", type=Path, required=True)
    a = sub.add_parser("gate"); a.add_argument("--manifest", type=Path, required=True)
    args = ap.parse_args(argv)
    try:
        if args.command == "init":
            result = init_site(args.slug, args.title, args.out)
        elif args.command == "audit": result = audit_site(args.site)
        else: result = release_gate(json.loads(args.manifest.read_text(encoding="utf-8")))
        print(json.dumps(result, ensure_ascii=False, indent=2))
        if args.command == "audit" and not result["ok"]: return 2
        if args.command == "gate" and not result["allowed_by_manifest"]: return 2
        return 0
    except (ValueError, OSError, json.JSONDecodeError) as err:
        print(f"ERROR: {err}", file=sys.stderr); return 3

if __name__ == "__main__":
    raise SystemExit(main())
