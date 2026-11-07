# Static quality checks for public orphan center preview

This change adds **read-only**, no-secrets, no-deploy GitHub Actions checks for the existing public preview branch. It does not change site HTML, research papers, databases, domains, build commands, or production configuration.

- **Scope:** `orphan-center-public-preview` branch only; runs when a PR targets that branch and touches QA or public-site assets, or via manual workflow dispatch.
- **Checks:** `lang="ar"`, `dir="rtl"`, non-empty title/description, viewport, `alt` presence on images, on-disk existence of literal local `href`/`src` references.
- **Does not check:** dynamic SPA routes, private pages, forms/accounts, legal content, live performance, full accessibility, or real users. Preview `robots.txt` currently contains `Disallow: /` and is deliberately not rewritten.
- **Why draft PR:** merging into the configured Render source branch may trigger an automatic Render redeploy despite unchanged site content; require explicit review before merge.
- **No telemetry:** zero outbound requests from the tests. No production secrets or user records are used.

Run locally: `python -m unittest discover -s tests -v && python tools/check_site.py --root .`.
