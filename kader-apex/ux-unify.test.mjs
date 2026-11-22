import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createPortalGateway } from "./gateway.mjs";

const css = readFileSync(new URL("./ux-unify.css", import.meta.url), "utf8");
const js = readFileSync(new URL("./ux-unify.js", import.meta.url), "utf8");
const portal = "<!doctype html><html lang='ar' dir='rtl'><head><title>كادر</title></head><body data-kader-ui='portal'><div class='topbar-actions'></div><main><h2>المهام</h2></main></body></html>";
const auth = "<!doctype html><html lang='ar' dir='rtl'><head><title>دخول</title></head><body data-kader-ui='auth'><form></form></body></html>";
function mockGateway(html, mimetype = "text/html; charset=utf-8") {
  const calls = [];
  const handler = createPortalGateway({
    allowedHosts: ["kader.media"],
    fetcher: async (url, options) => {
      calls.push({url, method: options.method, body: options.body});
      return new Response(html, {status: 200, headers: {"content-type": mimetype}});
    },
  });
  return {handler, calls};
}

test("UX stylesheet and JS are isolated and parse correctly", () => {
  assert.doesNotThrow(() => new Function(js));
  assert.match(js, /showModal\(\)/);
  assert.match(js, /aria-labelledby/);
  assert.match(js, /aria-keyshortcuts/);
  assert.match(js, /data-nav/);
  assert.match(css, /data-kader-ui="portal"/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /max-width: 760px/);
  assert.doesNotMatch(js, /\bfetch\s*\(|\bXMLHttpRequest\b/);
});

test("rendered portal gets exactly one CSS and one deferred JS enhancement", async () => {
  const {handler} = mockGateway(portal);
  const response = await handler(new Request("https://kader.media/mowaqqat/"));
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.equal((html.match(/data-kader-ux-css/g) || []).length, 1);
  assert.equal((html.match(/data-kader-ux-script/g) || []).length, 1);
  assert.match(html, /<script src="\/_kader\/ux-unify-20261122\.js" defer/);
  assert.match(html, /<link rel="stylesheet" href="\/_kader\/ux-unify-20261122\.css"/);
  assert.equal(response.headers.get("x-kader-ui-fix"), "20261110.v1");
});

test("login receives the scoped shared stylesheet, but no authenticated UI script", async () => {
  const {handler} = mockGateway(auth);
  const html = await (await handler(new Request("https://kader.media/mowaqqat/"))).text();
  assert.ok(html.includes("data-kader-ux-css"));
  assert.ok(!html.includes("data-kader-ux-script"));
  assert.match(html, /data-kader-ui='auth'/);
  assert.match(css, /data-kader-ui="auth"/);
});

test("the two public UX assets are safe read-only same-origin routes", async () => {
  const {handler, calls} = mockGateway(portal);
  for (const [path, kind, marker] of [
    ["/_kader/ux-unify-20261122.css", "text/css", "kader-ux-dialog"],
    ["/_kader/ux-unify-20261122.js", "text/javascript", "kader-ux-quick-dialog"],
  ]) {
    const get = await handler(new Request("https://kader.media" + path));
    assert.equal(get.status, 200);
    assert.ok(get.headers.get("content-type").startsWith(kind));
    assert.ok((await get.text()).includes(marker));
    const head = await handler(new Request("https://kader.media" + path, {method: "HEAD"}));
    assert.equal(head.status, 200);
    assert.equal(await head.text(), "");
    const post = await handler(new Request("https://kader.media" + path, {
      method: "POST", headers: {origin: "https://kader.media"}, body: "noop",
    }));
    assert.equal(post.status, 405);
  }
  assert.equal(calls.length, 0);
});

test("JSON API responses and app writes are not rewritten or retried", async () => {
  const {handler, calls} = mockGateway('{"ok":true}', "application/json");
  const res = await handler(new Request("https://kader.media/api/state"));
  assert.equal(await res.text(), '{"ok":true}');
  assert.equal(calls.length, 1);
  const write = await handler(new Request("https://kader.media/api/op", {
    method: "POST",
    headers: {origin: "https://kader.media", "content-type": "application/json"},
    body: '{"op":"test"}',
  }));
  assert.equal(write.status, 200);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].method, "POST");
  assert.equal(Buffer.from(calls[1].body).toString(), '{"op":"test"}');
});

test("HTML without a portal identity does not receive new overlay markup", async () => {
  const {handler} = mockGateway("<html><head></head><body><p>neutral</p></body></html>");
  const html = await (await handler(new Request("https://kader.media/mowaqqat/"))).text();
  assert.ok(!html.includes("data-kader-ux-script"));
});

test("foreign host is rejected before asset routing", async () => {
  const {handler} = mockGateway(portal);
  const r = await handler(new Request("https://example.org/_kader/ux-unify-20261122.js"));
  assert.equal(r.status, 421);
});

test("standalone identity-labelled utility page gets theme CSS but no navigation overlay", async () => {
  const page = "<html><head></head><body data-kader-ui='hr'><div class='panel'></div></body></html>";
  const {handler} = mockGateway(page);
  const html = await (await handler(new Request("https://kader.media/mowaqqat/hr.html"))).text();
  assert.ok(html.includes("data-kader-ux-css"));
  assert.ok(!html.includes("data-kader-ux-script"));
});
