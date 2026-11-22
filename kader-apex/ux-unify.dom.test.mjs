import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {JSDOM} from "jsdom";

const script = readFileSync(new URL("./ux-unify.js", import.meta.url), "utf8");
function page(kind = "portal") {
  const html = "<!doctype html><html lang='ar' dir='rtl'><head></head><body data-kader-ui='" + kind + "'>" +
    "<header><div class='topbar-actions'></div></header>" +
    "<aside class='sidebar'>" +
    "<button class='nav-item' data-nav='home'>الرئيسية</button>" +
    "<button class='nav-item' data-nav='tasks'>المهام</button>" +
    "</aside>" +
    "<main class='page-inner'><h2>ملخص الأعمال</h2>" +
    "<div role='tablist'><button role='tab' id='companyTab'>الشركات</button></div></main>" +
    "</body></html>";
  const dom = new JSDOM(html, {
    url: "https://kader.media/mowaqqat/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const {window} = dom;
  window.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
    this.setAttribute("open", "");
  };
  window.HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.removeAttribute("open");
    this.dispatchEvent(new window.Event("close"));
  };
  window.HTMLElement.prototype.scrollIntoView = function () {};
  window.eval(script);
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
  return dom;
}
function tick() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

test("portal quick-navigation opens and follows existing native tab click", async () => {
  const dom = page();
  const doc = dom.window.document;
  await tick();
  const launcher = doc.querySelector("[data-kader-ux-launcher]");
  assert.ok(launcher);
  let tabsSelected = 0;
  doc.getElementById("companyTab").addEventListener("click", () => tabsSelected++);
  launcher.click();
  const dialog = doc.getElementById("kader-ux-quick-dialog");
  assert.equal(dialog.open, true);
  const search = doc.querySelector(".kader-ux-search");
  assert.equal(doc.activeElement, search);
  search.value = "شركات";
  search.dispatchEvent(new dom.window.Event("input", {bubbles: true}));
  assert.ok(doc.querySelector(".kader-ux-results").textContent.includes("الشركات"));
  const matching = [...doc.querySelectorAll(".kader-ux-result-button")]
    .find(button => button.textContent.includes("الشركات"));
  assert.ok(matching);
  matching.click();
  assert.equal(tabsSelected, 1);
  assert.equal(dialog.open, false);
  dom.window.close();
});

test("compact density is optional, accessible and browser-local", async () => {
  const dom = page();
  const doc = dom.window.document;
  await tick();
  doc.querySelector("[data-kader-ux-launcher]").click();
  const compact = doc.querySelector('[data-kader-density-choice="compact"]');
  assert.ok(compact);
  compact.click();
  assert.equal(doc.body.dataset.kaderDensity, "compact");
  assert.equal(compact.getAttribute("aria-pressed"), "true");
  assert.equal(dom.window.localStorage.getItem("kader.ux.density.v1"), "compact");
  const relaxed = doc.querySelector('[data-kader-density-choice="comfortable"]');
  relaxed.click();
  assert.equal(doc.body.dataset.kaderDensity, "comfortable");
  dom.window.close();
});

test("login page does not get navigation controls", async () => {
  const dom = page("auth");
  const doc = dom.window.document;
  await tick();
  assert.equal(doc.querySelector("[data-kader-ux-launcher]"), null);
  assert.equal(doc.getElementById("kader-ux-quick-dialog"), null);
  dom.window.close();
});

test("new topbars after SPA rerender get exactly one launcher", async () => {
  const dom = page();
  const doc = dom.window.document;
  await tick();
  const old = doc.querySelector(".topbar-actions");
  old.remove();
  const next = doc.createElement("div");
  next.className = "topbar-actions";
  doc.querySelector("header").appendChild(next);
  await tick();
  assert.equal(next.querySelectorAll("[data-kader-ux-launcher]").length, 1);
  await tick();
  assert.equal(next.querySelectorAll("[data-kader-ux-launcher]").length, 1);
  dom.window.close();
});

test("Ctrl+K opens native dialog and Escape remains a browser dialog behavior", async () => {
  const dom = page();
  const doc = dom.window.document;
  await tick();
  const e = new dom.window.KeyboardEvent("keydown", {
    key: "k", ctrlKey: true, bubbles: true, cancelable: true,
  });
  doc.dispatchEvent(e);
  assert.equal(e.defaultPrevented, true);
  assert.equal(doc.getElementById("kader-ux-quick-dialog").open, true);
  dom.window.close();
});
