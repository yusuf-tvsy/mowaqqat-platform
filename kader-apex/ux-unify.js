/* Kader UX unification 2026-11-22.
   Progressive presentation-only enhancement: no API requests or state writes. */
(() => {
  "use strict";
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const VERSION = "20261122.1";
  const DIALOG_ID = "kader-ux-quick-dialog";
  const STORAGE_KEY = "kader.ux.density.v1";
  let dialog, searchInput, results, sourceButton;
  let scheduled = false;
  let stopped = false;

  const isPortal = () => document.body?.dataset.kaderUi === "portal";
  const byId = id => document.getElementById(id);
  const el = (tag, classes, text) => {
    const node = document.createElement(tag);
    if (classes) node.className = classes;
    if (text) node.textContent = text;
    return node;
  };
  function safeStorage(action, value) {
    try {
      if (action === "read") return window.localStorage.getItem(STORAGE_KEY);
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch { /* private browsing or locked storage */ }
    return null;
  }
  function setDensity(mode, persist = true) {
    const selected = mode === "compact" ? "compact" : "comfortable";
    if (document.body) document.body.dataset.kaderDensity = selected;
    if (persist) safeStorage("write", selected);
    document.querySelectorAll("[data-kader-density-choice]").forEach(button => {
      const chosen = button.dataset.kaderDensityChoice === selected;
      button.setAttribute("aria-pressed", String(chosen));
    });
  }
  function normalized(value) {
    return String(value || "")
      .normalize("NFKC").toLowerCase()
      .replace(/[\u064b-\u065f\u0670\u0640]/g, "")
      .replace(/[أإآ]/g, "ا").replace(/ى/g, "ي")
      .replace(/\s+/g, " ").trim();
  }
  function isAllowed(element) {
    return element.isConnected
      && !element.closest("[hidden], [aria-hidden='true'], .hidden")
      && element.getAttribute("aria-disabled") !== "true"
      && window.getComputedStyle(element).display !== "none"
      && window.getComputedStyle(element).visibility !== "hidden";
  }
  function findTargets() {
    const items = [], seen = new Set();
    const links = document.querySelectorAll(
      ".sidebar [data-nav], .nav-item[data-nav], .topbar [data-nav]"
    );
    for (const element of links) {
      if (!isAllowed(element)) continue;
      const key = element.getAttribute("data-nav");
      if (!key || !/^[a-z0-9_-]{1,80}$/i.test(key) || seen.has(key)) continue;
      if (/^(logout|signout|sign-out|delete|remove)$/i.test(key)) continue;
      const label = (element.getAttribute("aria-label") || element.textContent || "")
        .replace(/\s+/g, " ").trim().slice(0, 72);
      if (!label) continue;
      seen.add(key);
      items.push({ label, kind: "قسم", activate: () => {
        if (element.isConnected) element.click();
      } });
    }
    const tabs = document.querySelectorAll(
      '[role="tab"], .tabs button, .tabbar button, .nav-tabs button'
    );
    const seenTabs = new Set();
    for (const element of tabs) {
      if (!isAllowed(element) || element.disabled || seenTabs.has(element)) continue;
      const label = (element.getAttribute("aria-label") || element.textContent || "")
        .replace(/\s+/g, " ").trim().slice(0, 72);
      if (!label) continue;
      seenTabs.add(element);
      items.push({ label, kind: "تبويب", activate: () => {
        if (element.isConnected) element.click();
      } });
    }
    const sections = document.querySelectorAll(
      ".page-inner h2, .page-inner h3, main h2, main h3"
    );
    const seenHeadings = new Set();
    for (const element of sections) {
      if (!isAllowed(element) || seenHeadings.has(element)) continue;
      const label = (element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 72);
      if (!label) continue;
      seenHeadings.add(element);
      items.push({ label, kind: "في الصفحة", activate: () => {
        if (element.isConnected) element.scrollIntoView({ block: "start", behavior: "smooth" });
      } });
      if (items.length >= 90) break;
    }
    return items;
  }
  function renderResults(query = "") {
    if (!results) return;
    results.replaceChildren();
    const needle = normalized(query);
    const matches = findTargets()
      .filter(item => !needle || normalized(item.label).includes(needle))
      .slice(0, 35);
    const count = el("p", "kader-ux-count", matches.length
      ? (needle ? "النتائج: " + matches.length : "اختر القسم أو عنوان الصفحة")
      : "لم نجد نتيجة مطابقة؛ جرّب كلمة أخرى.");
    results.appendChild(count);
    const list = el("ul", "kader-ux-results-list");
    for (const item of matches) {
      const row = el("li", "kader-ux-result");
      const button = el("button", "kader-ux-result-button");
      button.type = "button";
      const name = el("span", "kader-ux-result-label", item.label);
      const kind = el("small", "kader-ux-result-kind", item.kind);
      button.append(name, kind);
      button.addEventListener("click", () => {
        dialog?.close();
        item.activate();
      });
      row.appendChild(button);
      list.appendChild(row);
    }
    results.appendChild(list);
  }
  function buildDialog() {
    if (dialog?.isConnected) return dialog;
    const existing = byId(DIALOG_ID);
    if (existing) { dialog = existing; return dialog; }
    dialog = el("dialog", "kader-ux-dialog");
    dialog.id = DIALOG_ID;
    dialog.setAttribute("aria-labelledby", "kader-ux-quick-title");
    dialog.setAttribute("aria-describedby", "kader-ux-quick-desc");
    const surface = el("div", "kader-ux-dialog-content");
    const heading = el("div", "kader-ux-dialog-heading");
    const h = el("h2", "", "انتقال سريع");
    h.id = "kader-ux-quick-title";
    const close = el("button", "kader-ux-close", "إغلاق");
    close.type = "button";
    close.setAttribute("aria-label", "إغلاق نافذة الانتقال السريع");
    close.addEventListener("click", () => dialog.close());
    heading.append(h, close);
    const desc = el("p", "kader-ux-description",
      "ابحث عن قسم أو عنوان في الصفحة، أو اضبط كثافة العرض.");
    desc.id = "kader-ux-quick-desc";
    searchInput = el("input", "kader-ux-search");
    searchInput.type = "search";
    searchInput.placeholder = "ابحث في الأقسام والتبويبات…";
    searchInput.autocomplete = "off";
    searchInput.setAttribute("aria-label", "البحث في الأقسام وعناوين الصفحة");
    searchInput.addEventListener("input", () => renderResults(searchInput.value));
    searchInput.addEventListener("keydown", event => {
      if (event.key !== "Enter") return;
      const first = results?.querySelector(".kader-ux-result-button");
      if (!first) return;
      event.preventDefault();
      first.click();
    });
    const settings = el("details", "kader-ux-settings");
    const summary = el("summary", "", "خيارات العرض");
    const settingsBody = el("div", "kader-ux-density");
    for (const [mode, label] of [
      ["comfortable", "عرض مريح"],
      ["compact", "عرض مختصر"],
    ]) {
      const button = el("button", "kader-ux-density-choice", label);
      button.type = "button";
      button.dataset.kaderDensityChoice = mode;
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", () => setDensity(mode));
      settingsBody.appendChild(button);
    }
    settings.append(summary, settingsBody);
    results = el("div", "kader-ux-results");
    results.setAttribute("aria-live", "polite");
    surface.append(heading, desc, searchInput, settings, results);
    dialog.appendChild(surface);
    dialog.addEventListener("click", event => {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener("close", () => {
      if (sourceButton?.isConnected) sourceButton.focus();
    });
    document.body.appendChild(dialog);
    setDensity(document.body.dataset.kaderDensity || safeStorage("read"), false);
    return dialog;
  }
  function openDialog(trigger) {
    if (!isPortal()) return;
    sourceButton = trigger && trigger.isConnected ? trigger : document.activeElement;
    const current = buildDialog();
    if (!current.open) current.showModal();
    searchInput.value = "";
    renderResults();
    searchInput.focus();
  }
  function sync() {
    if (!document.body) return;
    if (!isPortal()) {
      document.querySelectorAll("[data-kader-ux-launcher]").forEach(node => node.remove());
      if (dialog?.open) dialog.close();
      dialog?.remove();
      dialog = null;
      searchInput = null;
      results = null;
      return;
    }
    if (!document.body.dataset.kaderDensity) setDensity(safeStorage("read"), false);
    const host = document.querySelector(".topbar-actions, .topbar, header.page-header");
    if (!host || host.querySelector("[data-kader-ux-launcher]")) return;
    const button = el("button", "kader-ux-launcher");
    button.type = "button";
    button.dataset.kaderUxLauncher = VERSION;
    button.setAttribute("aria-label", "الانتقال السريع إلى الأقسام");
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-controls", DIALOG_ID);
    button.setAttribute("aria-keyshortcuts", "Control+K Meta+K");
    const glyph = el("span", "kader-ux-launcher-icon", "⌕");
    glyph.setAttribute("aria-hidden", "true");
    const label = el("span", "kader-ux-launcher-label", "الأقسام");
    button.append(glyph, label);
    button.addEventListener("click", () => openDialog(button));
    host.appendChild(button);
  }
  function scheduleSync() {
    if (scheduled || stopped) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; if (!stopped) sync(); });
  }
  document.addEventListener("keydown", event => {
    if (!isPortal() || event.defaultPrevented) return;
    if (event.key === "Escape" && dialog?.open) return; // native dialog handles Escape
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "k") {
      event.preventDefault();
      openDialog();
    }
  });
  function boot() {
    sync();
    const observer = new MutationObserver(scheduleSync);
    observer.observe(document.body, {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ["data-kader-ui"],
    });
    window.addEventListener("pagehide", () => {
      stopped = true;
      observer.disconnect();
    }, {once: true});
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else boot();
})();