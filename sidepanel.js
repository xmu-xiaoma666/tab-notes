(function initSidePanel() {
  "use strict";

  const U = globalThis.TabNotesUtils;
  const state = {
    tabs: [],
    notes: {},
    prefixRules: [],
    activeTab: null,
    color: U.DEFAULT_COLOR,
    ruleColor: U.DEFAULT_COLOR,
    filter: "all",
    query: "",
    windowId: null,
    editingRuleId: ""
  };
  let expectedNotesSnapshot = null;
  let expectedRulesSnapshot = null;
  let cachedRenderFrame = null;

  const $ = (selector) => document.querySelector(selector);
  const form = $("#note-form");
  const aliasInput = $("#alias");
  const tagInput = $("#tag");
  const noteInput = $("#note");
  const showCardInput = $("#show-card");
  const ruleForm = $("#prefix-rule-form");
  const ruleIdInput = $("#rule-id");
  const rulePrefixInput = $("#rule-prefix");
  const ruleAliasInput = $("#rule-alias");
  const ruleTagInput = $("#rule-tag");
  const ruleNoteInput = $("#rule-note");

  async function loadStoredData() {
    const result = await chrome.storage.local.get([U.STORAGE_KEY, U.PREFIX_RULES_KEY]);
    state.notes = result[U.STORAGE_KEY] || {};
    state.prefixRules = U.sanitizePrefixRules(result[U.PREFIX_RULES_KEY]);
  }

  async function loadTabs() {
    const [tabs, active, currentWindow] = await Promise.all([
      chrome.tabs.query({}),
      chrome.tabs.query({ active: true, currentWindow: true }),
      chrome.windows.getCurrent()
    ]);
    state.tabs = tabs;
    state.windowId = currentWindow && currentWindow.id;
    state.activeTab = active[0] || state.tabs.find((tab) => tab.active) || null;
  }

  function matchingRuleFor(tab) {
    return U.findMatchingPrefixRule(state.prefixRules, tab && tab.url);
  }

  function noteFor(tab) {
    return U.resolveNoteForUrl(
      state.notes,
      state.prefixRules,
      tab && tab.url,
      tab && U.stripTabNotePrefixes(tab.title)
    );
  }

  function renderColors() {
    const picker = $("#color-picker");
    picker.textContent = "";
    U.COLORS.forEach((color) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `color-choice${color === state.color ? " selected" : ""}`;
      button.style.setProperty("--choice", color);
      button.title = color;
      button.setAttribute("aria-label", `选择颜色 ${color}`);
      button.addEventListener("click", () => {
        state.color = color;
        renderColors();
        renderPreview();
      });
      picker.append(button);
    });
  }

  function renderRuleColors() {
    const picker = $("#rule-color-picker");
    picker.textContent = "";
    U.COLORS.forEach((color) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `color-choice${color === state.ruleColor ? " selected" : ""}`;
      button.style.setProperty("--choice", color);
      button.title = color;
      button.setAttribute("aria-label", `选择规则颜色 ${color}`);
      button.addEventListener("click", () => {
        state.ruleColor = color;
        renderRuleColors();
      });
      picker.append(button);
    });
  }

  function renderPreview() {
    const draft = {
      alias: aliasInput.value,
      tag: tagInput.value,
      note: noteInput.value,
      color: state.color
    };
    const baseTitle = state.activeTab ? U.stripTabNotePrefixes(state.activeTab.title) : "网页标题";
    $("#title-preview").textContent = U.hasContent(draft)
      ? U.formatTabTitle(draft, baseTitle)
      : "输入短标题后即可预览";
  }

  function renderCurrent() {
    const tab = state.activeTab;
    if (!tab) return;
    const key = U.normalizeUrl(tab.url);
    const exact = state.notes[key] || null;
    const rule = matchingRuleFor(tab);
    const saved = U.resolveNoteForUrl(state.notes, state.prefixRules, tab.url, tab.title);
    $("#current-page-title").textContent = U.stripTabNotePrefixes(tab.title) || "无标题网页";
    $("#current-url").textContent = tab.url || "";
    $("#current-favicon").src = tab.favIconUrl || "";
    $("#current-favicon").hidden = !tab.favIconUrl;
    $("#unsupported").hidden = /^https?:/i.test(tab.url || "");
    aliasInput.value = saved ? saved.alias : "";
    tagInput.value = saved ? saved.tag : "";
    noteInput.value = saved ? saved.note : "";
    showCardInput.checked = saved ? saved.showCard : false;
    state.color = saved ? saved.color : U.DEFAULT_COLOR;
    const match = $("#matched-rule");
    match.hidden = !rule;
    $("#matched-rule-prefix").textContent = rule ? rule.prefix : "";
    $("#matched-rule-title").textContent = exact
      ? "当前单页备注已覆盖前缀默认值"
      : "已应用网址前缀默认值";
    $("#alias-hint").textContent = rule && !exact
      ? "来自前缀默认值，可直接修改"
      : "显示在标签页最前面";
    $("#delete-button").hidden = !exact;
    $("#delete-button").textContent = rule ? "恢复前缀默认" : "删除";
    renderColors();
    renderPreview();
  }

  function createPageItem(tab, saved, isSavedOnly) {
    const item = $("#page-item-template").content.firstElementChild.cloneNode(true);
    const label = saved ? U.getLabel(saved) : "未备注";
    item.querySelector(".item-label").textContent = label;
    item.querySelector(".item-title").textContent =
      U.stripTabNotePrefixes((tab && tab.title) || (saved && (saved.pageTitle || saved.url))) || "无标题网页";
    const tag = item.querySelector(".item-tag");
    tag.textContent = saved && saved.tag ? saved.tag : "";
    tag.hidden = !(saved && saved.tag);
    const note = item.querySelector(".item-note");
    note.textContent = saved && saved.note ? saved.note.replace(/\s+/g, " ") : (tab && tab.url) || "";
    item.querySelector(".item-color").style.background = saved ? saved.color : "transparent";
    const favicon = item.querySelector(".item-favicon");
    favicon.src = tab && tab.favIconUrl ? tab.favIconUrl : "";
    favicon.hidden = !(tab && tab.favIconUrl);
    item.classList.toggle("active", Boolean(tab && state.activeTab && tab.id === state.activeTab.id));
    item.addEventListener("click", async () => {
      if (isSavedOnly) {
        await chrome.tabs.create({ url: saved.url });
      } else {
        await chrome.windows.update(tab.windowId, { focused: true });
        await chrome.tabs.update(tab.id, { active: true });
      }
    });
    return item;
  }

  function renderLists() {
    const openContainer = $("#open-tabs");
    const savedContainer = $("#saved-pages");
    openContainer.textContent = "";
    savedContainer.textContent = "";

    const openUrls = new Set(state.tabs.map((tab) => U.normalizeUrl(tab.url)));
    const visibleTabs = state.tabs
      .filter((tab) => {
        const saved = noteFor(tab);
        if (state.filter === "noted" && !saved) return false;
        return U.matchesSearch(saved, tab, state.query);
      })
      .sort((a, b) => {
        const aNote = noteFor(a) ? 1 : 0;
        const bNote = noteFor(b) ? 1 : 0;
        if (aNote !== bNote) return bNote - aNote;
        if (a.active !== b.active) return a.active ? -1 : 1;
        return (a.windowId - b.windowId) || (a.index - b.index);
      });

    const openFragment = document.createDocumentFragment();
    visibleTabs.forEach((tab) => openFragment.append(createPageItem(tab, noteFor(tab), false)));
    openContainer.append(openFragment);
    if (!visibleTabs.length) openContainer.innerHTML = '<div class="empty">没有匹配的已打开网页</div>';

    const savedOnly = Object.values(state.notes)
      .filter((saved) => !openUrls.has(saved.url))
      .filter((saved) => U.matchesSearch(saved, null, state.query))
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    $("#saved-section").hidden = !savedOnly.length || state.filter === "all" && !state.query && savedOnly.length === 0;
    const savedFragment = document.createDocumentFragment();
    savedOnly.forEach((saved) => savedFragment.append(createPageItem(null, saved, true)));
    savedContainer.append(savedFragment);

    const notedCount = state.tabs.filter((tab) => noteFor(tab)).length;
    $("#tabs-summary").textContent = `${state.tabs.length} 个已打开 · ${notedCount} 个有备注`;
  }

  async function renderAll({ keepEditor = false } = {}) {
    await Promise.all([loadStoredData(), loadTabs()]);
    if (!keepEditor) renderCurrent();
    renderRuleList();
    renderLists();
  }

  function renderFromCache({ keepEditor = true } = {}) {
    if (cachedRenderFrame !== null) cancelAnimationFrame(cachedRenderFrame);
    cachedRenderFrame = requestAnimationFrame(() => {
      cachedRenderFrame = null;
      if (!keepEditor) renderCurrent();
      renderRuleList();
      renderLists();
    });
  }

  async function saveCurrent(event) {
    event.preventDefault();
    const tab = state.activeTab;
    if (!tab) return;
    $("#save-state").textContent = "保存中…";
    const key = U.normalizeUrl(tab.url);
    const latestResult = await chrome.storage.local.get(U.STORAGE_KEY);
    const latestNotes = latestResult[U.STORAGE_KEY] || {};
    const old = latestNotes[key];
    const saved = U.sanitizeNote({
      url: key,
      pageTitle: U.stripTabNotePrefixes(tab.title),
      alias: aliasInput.value,
      tag: tagInput.value,
      note: noteInput.value,
      color: state.color,
      showCard: showCardInput.checked
    }, old);

    if (!U.hasContent(saved)) {
      $("#save-state").textContent = "请至少填写一项";
      setTimeout(() => { $("#save-state").textContent = ""; }, 1600);
      return;
    }
    latestNotes[key] = saved;
    state.notes = latestNotes;
    if (matchingRuleFor(tab)) {
      $("#matched-rule-title").textContent = "当前单页备注已覆盖前缀默认值";
      $("#alias-hint").textContent = "显示在标签页最前面";
    }
    expectedNotesSnapshot = JSON.stringify(latestNotes);
    renderFromCache({ keepEditor: true });
    try {
      await chrome.storage.local.set({ [U.STORAGE_KEY]: latestNotes });
    } catch (_error) {
      expectedNotesSnapshot = null;
      $("#save-state").textContent = "保存失败，请重试";
      return;
    }
    $("#save-state").textContent = "已保存";
    $("#delete-button").hidden = false;
    setTimeout(() => { $("#save-state").textContent = ""; }, 1600);
  }

  async function deleteCurrent() {
    const tab = state.activeTab;
    if (!tab) return;
    const key = U.normalizeUrl(tab.url);
    const latestResult = await chrome.storage.local.get(U.STORAGE_KEY);
    const latestNotes = latestResult[U.STORAGE_KEY] || {};
    delete latestNotes[key];
    state.notes = latestNotes;
    expectedNotesSnapshot = JSON.stringify(latestNotes);
    try {
      await chrome.storage.local.set({ [U.STORAGE_KEY]: latestNotes });
    } catch (_error) {
      expectedNotesSnapshot = null;
      $("#save-state").textContent = "删除失败，请重试";
      return;
    }
    renderCurrent();
    renderLists();
    $("#save-state").textContent = matchingRuleFor(tab) ? "已恢复前缀默认" : "已删除";
    setTimeout(() => { $("#save-state").textContent = ""; }, 1600);
  }

  function makeRuleId() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
      return globalThis.crypto.randomUUID();
    }
    return `rule-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function setRuleSaveState(message, clear = true) {
    $("#rule-save-state").textContent = message;
    if (clear) setTimeout(() => {
      if ($("#rule-save-state").textContent === message) $("#rule-save-state").textContent = "";
    }, 1800);
  }

  function resetRuleForm() {
    state.editingRuleId = "";
    ruleIdInput.value = "";
    rulePrefixInput.value = "";
    ruleAliasInput.value = "";
    ruleTagInput.value = "";
    ruleNoteInput.value = "";
    state.ruleColor = U.DEFAULT_COLOR;
    renderRuleColors();
    $("#delete-rule-button").hidden = true;
    $("#rule-save-state").textContent = "";
    renderRuleList();
  }

  function editRule(ruleId) {
    const rule = state.prefixRules.find((candidate) => candidate.id === ruleId);
    if (!rule) return;
    state.editingRuleId = rule.id;
    ruleIdInput.value = rule.id;
    rulePrefixInput.value = rule.prefix;
    ruleAliasInput.value = rule.alias;
    ruleTagInput.value = rule.tag;
    ruleNoteInput.value = rule.note;
    state.ruleColor = rule.color;
    renderRuleColors();
    $("#delete-rule-button").hidden = false;
    renderRuleList();
    $("#prefix-rules-panel").scrollIntoView({ behavior: "smooth", block: "start" });
    requestAnimationFrame(() => rulePrefixInput.focus());
  }

  function renderRuleList() {
    const container = $("#prefix-rule-list");
    container.textContent = "";
    const rules = [...state.prefixRules].sort((a, b) =>
      (b.prefix.length - a.prefix.length) || String(b.updatedAt).localeCompare(String(a.updatedAt))
    );
    $("#prefix-rules-summary").textContent = rules.length
      ? `${rules.length} 条规则 · 最长前缀优先`
      : "相同网址前缀共用默认备注";
    rules.forEach((rule) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = `rule-item${rule.id === state.editingRuleId ? " active" : ""}`;

      const head = document.createElement("span");
      head.className = "rule-item-head";
      const title = document.createElement("span");
      title.className = "rule-item-title";
      const color = document.createElement("span");
      color.className = "rule-item-color";
      color.style.background = rule.color;
      const alias = document.createElement("strong");
      alias.textContent = rule.alias;
      title.append(color, alias);
      if (rule.tag) {
        const tag = document.createElement("span");
        tag.className = "rule-item-tag";
        tag.textContent = rule.tag;
        title.append(tag);
      }
      const matches = document.createElement("small");
      const matchCount = state.tabs.filter((tab) => {
        const matched = matchingRuleFor(tab);
        return matched && matched.id === rule.id;
      }).length;
      matches.textContent = `${matchCount} 个已打开`;
      head.append(title, matches);

      const prefix = document.createElement("span");
      prefix.className = "rule-item-prefix";
      prefix.textContent = rule.prefix;
      item.append(head, prefix);
      if (rule.note) {
        const note = document.createElement("span");
        note.className = "rule-item-note";
        note.textContent = rule.note.replace(/\s+/g, " ");
        item.append(note);
      }
      item.addEventListener("click", () => editRule(rule.id));
      container.append(item);
    });
  }

  async function savePrefixRule(event) {
    event.preventDefault();
    const prefix = U.normalizePrefix(rulePrefixInput.value);
    const alias = U.cleanText(ruleAliasInput.value, 24);
    if (!prefix) {
      setRuleSaveState("请输入有效的 http(s) 网址前缀", false);
      rulePrefixInput.focus();
      return;
    }
    if (!alias) {
      setRuleSaveState("请填写共用标签短标题", false);
      ruleAliasInput.focus();
      return;
    }

    setRuleSaveState("保存中…", false);
    const latestResult = await chrome.storage.local.get(U.PREFIX_RULES_KEY);
    const latestRules = U.sanitizePrefixRules(latestResult[U.PREFIX_RULES_KEY]);
    const requestedId = ruleIdInput.value || state.editingRuleId;
    const old = latestRules.find((rule) => rule.id === requestedId) ||
      latestRules.find((rule) => rule.prefix === prefix) || null;
    const saved = U.sanitizePrefixRule({
      id: old ? old.id : requestedId || makeRuleId(),
      prefix,
      alias,
      tag: ruleTagInput.value,
      color: state.ruleColor,
      note: ruleNoteInput.value
    }, old);
    const nextRules = latestRules.filter((rule) => rule.id !== saved.id && rule.prefix !== saved.prefix);
    nextRules.push(saved);
    const sanitizedRules = U.sanitizePrefixRules(nextRules);
    state.prefixRules = sanitizedRules;
    state.editingRuleId = saved.id;
    ruleIdInput.value = saved.id;
    expectedRulesSnapshot = JSON.stringify(sanitizedRules);
    renderCurrent();
    renderRuleList();
    renderLists();
    try {
      await chrome.storage.local.set({ [U.PREFIX_RULES_KEY]: sanitizedRules });
    } catch (_error) {
      expectedRulesSnapshot = null;
      setRuleSaveState("保存失败，请重试", false);
      return;
    }
    $("#delete-rule-button").hidden = false;
    setRuleSaveState("规则已保存");
  }

  async function deletePrefixRule() {
    const ruleId = ruleIdInput.value || state.editingRuleId;
    if (!ruleId) return;
    const latestResult = await chrome.storage.local.get(U.PREFIX_RULES_KEY);
    const latestRules = U.sanitizePrefixRules(latestResult[U.PREFIX_RULES_KEY]);
    const nextRules = latestRules.filter((rule) => rule.id !== ruleId);
    state.prefixRules = nextRules;
    expectedRulesSnapshot = JSON.stringify(nextRules);
    try {
      await chrome.storage.local.set({ [U.PREFIX_RULES_KEY]: nextRules });
    } catch (_error) {
      expectedRulesSnapshot = null;
      setRuleSaveState("删除失败，请重试", false);
      return;
    }
    resetRuleForm();
    renderCurrent();
    renderLists();
    setRuleSaveState("规则已删除");
  }

  form.addEventListener("submit", saveCurrent);
  $("#delete-button").addEventListener("click", deleteCurrent);
  ruleForm.addEventListener("submit", savePrefixRule);
  $("#delete-rule-button").addEventListener("click", deletePrefixRule);
  $("#new-rule-button").addEventListener("click", resetRuleForm);
  $("#use-current-url").addEventListener("click", () => {
    rulePrefixInput.value = state.activeTab ? U.normalizeUrl(state.activeTab.url) : "";
    rulePrefixInput.focus();
  });
  $("#edit-matched-rule").addEventListener("click", () => {
    const rule = matchingRuleFor(state.activeTab);
    if (rule) editRule(rule.id);
  });
  [aliasInput, tagInput, noteInput].forEach((input) => input.addEventListener("input", renderPreview));
  $("#search").addEventListener("input", (event) => {
    state.query = event.target.value;
    renderLists();
  });
  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach((candidate) => candidate.classList.toggle("active", candidate === button));
      renderLists();
    });
  });
  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") form.requestSubmit();
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    let shouldRender = false;
    let shouldRefreshEditor = false;
    if (changes[U.STORAGE_KEY]) {
      const nextNotes = changes[U.STORAGE_KEY].newValue || {};
      state.notes = nextNotes;
      const nextSnapshot = JSON.stringify(nextNotes);
      if (expectedNotesSnapshot === nextSnapshot) {
        expectedNotesSnapshot = null;
      } else {
        expectedNotesSnapshot = null;
        shouldRender = true;
      }
    }
    if (changes[U.PREFIX_RULES_KEY]) {
      const nextRules = U.sanitizePrefixRules(changes[U.PREFIX_RULES_KEY].newValue);
      state.prefixRules = nextRules;
      const nextSnapshot = JSON.stringify(nextRules);
      if (expectedRulesSnapshot === nextSnapshot) {
        expectedRulesSnapshot = null;
      } else {
        expectedRulesSnapshot = null;
        shouldRender = true;
        shouldRefreshEditor = true;
      }
    }
    if (shouldRender) renderFromCache({ keepEditor: !shouldRefreshEditor });
  });
  chrome.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
    const index = state.tabs.findIndex((tab) => tab.id === tabId);
    let tab = index >= 0 ? state.tabs[index] : null;
    if (!tab) {
      try {
        tab = await chrome.tabs.get(tabId);
        state.tabs.push(tab);
      } catch (_error) {
        return;
      }
    }
    state.tabs.forEach((candidate) => {
      if (candidate.windowId === windowId) candidate.active = candidate.id === tabId;
    });
    if (state.windowId === null || windowId === state.windowId) {
      state.windowId = windowId;
      state.activeTab = tab;
      renderCurrent();
      requestAnimationFrame(() => aliasInput.focus());
    }
    renderFromCache({ keepEditor: true });
  });
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    const index = state.tabs.findIndex((candidate) => candidate.id === tabId);
    if (index < 0) {
      state.tabs.push(tab);
    } else {
      state.tabs[index] = { ...state.tabs[index], ...tab, ...changeInfo };
    }
    if (state.activeTab && state.activeTab.id === tabId) {
      state.activeTab = state.tabs.find((candidate) => candidate.id === tabId) || tab;
      if (changeInfo.url) renderCurrent();
    }
    renderFromCache({ keepEditor: true });
  });
  chrome.tabs.onRemoved.addListener((tabId) => {
    state.tabs = state.tabs.filter((tab) => tab.id !== tabId);
    if (state.activeTab && state.activeTab.id === tabId) {
      state.activeTab = state.tabs.find((tab) => tab.active && tab.windowId === state.windowId) || null;
      if (state.activeTab) renderCurrent();
    }
    renderFromCache({ keepEditor: true });
  });

  renderRuleColors();
  renderAll();
})();
