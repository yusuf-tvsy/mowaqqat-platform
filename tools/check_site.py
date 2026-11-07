#!/usr/bin/env python3
"""Offline QA for a published-source STATIC website. Does not contact any server."""
import argparse
from html.parser import HTMLParser
import json
from pathlib import Path
from urllib.parse import unquote, urlsplit


class SiteParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.lang = None
        self.direction = None
        self.has_viewport = False
        self.has_description = False
        self.images_without_alt = []
        self.local_links = []
        self.in_title = False
        self.title = ""

    def handle_starttag(self, tag, attrs):
        attr = dict(attrs)
        if tag == "html":
            self.lang = attr.get("lang")
            self.direction = attr.get("dir")
        elif tag == "meta":
            name = (attr.get("name") or "").lower()
            self.has_viewport |= name == "viewport" and bool(attr.get("content"))
            self.has_description |= name == "description" and bool(attr.get("content"))
        elif tag == "title":
            self.in_title = True
        elif tag == "img" and "alt" not in attr:
            self.images_without_alt.append(attr.get("src", "<unknown>"))
        if tag in {"a", "img", "link", "script", "source"}:
            value = attr.get("src") or attr.get("href")
            if value:
                self.local_links.append(value)

    def handle_endtag(self, tag):
        if tag == "title":
            self.in_title = False

    def handle_data(self, data):
        if self.in_title:
            self.title += data


def linked_file(root: Path, value: str):
    """Return (path, error) for local references; ignore remote/fragment links."""
    value = value.strip()
    if value.startswith(("#", "//")) or chr(36) + "{" in value:
        return None, None
    parsed = urlsplit(value)
    if parsed.scheme or parsed.netloc or not parsed.path:
        return None, None
    relative = unquote(parsed.path).lstrip("/")
    if not relative:
        relative = "index.html"
    target = (root / relative).resolve()
    if not target.is_relative_to(root.resolve()):
        return None, f"Unsafe local path: {value}"
    if relative.endswith("/") or target.is_dir():
        target = target / "index.html"
    return target, None


def audit(root: Path):
    root = root.resolve()
    issues = []
    site = root / "index.html"
    if not site.is_file():
        return {"ok": False, "issues": ["Missing index.html"], "local_references_checked": 0}
    p = SiteParser()
    p.feed(site.read_text(encoding="utf-8"))
    if p.lang != "ar":
        issues.append("Expected <html lang=\"ar\">")
    if p.direction != "rtl":
        issues.append("Expected <html dir=\"rtl\">")
    if not p.title.strip():
        issues.append("Missing non-empty page title")
    if not p.has_viewport:
        issues.append("Missing viewport metadata")
    if not p.has_description:
        issues.append("Missing description metadata")
    for src in p.images_without_alt:
        issues.append(f"Image has no alt attribute: {src}")
    refs_checked = 0
    for link in p.local_links:
        path, error = linked_file(root, link)
        if error:
            issues.append(error)
        elif path:
            refs_checked += 1
            if not path.is_file():
                issues.append(f"Broken local file reference: {link}")
    return {"ok": not issues, "issues": sorted(set(issues)), "local_references_checked": refs_checked}


def main():
    a = argparse.ArgumentParser(description="Read-only static HTML source audit")
    a.add_argument("--root", type=Path, default=Path("."))
    args = a.parse_args()
    result = audit(args.root)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
