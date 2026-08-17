(function initSidePanel() {
  "use strict";

  const U = globalThis.TabNotesUtils;
  const state = {
    tabs: [],
    notes: {},
    activeTab: null,
    color: U.DEFAULT_COLOR,
    filter: "all",
    query: "",
    windowId: null
  };
  let expectedStorageSnapshot = null;
  let cachedRenderFrame = null;

  const $ = (selector) => document.querySelector(selector);
  const form = $("#note-form");
  const aliasInput = $("#alias");
  const tagInput = $("#tag");
  const noteInput = $("#note");
  const showCardInput = $("#show-card");

  async function loadNotes() {
    const result = await chrome.storage.local.get(U.STORAGE_KEY);
    state.notes = result[U.STORAGE_KEY] || {};
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

  function noteFor(tab) {
    return state.notes[U.normalizeUrl(tab && tab.url)] || null;
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
    const saved = state.notes[key] || null;
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
    $("#delete-button").hidden = !saved;
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
    await Promise.all([loadNotes(), loadTabs()]);
    if (!keepEditor) renderCurrent();
    renderLists();
  }

  function renderFromCache({ keepEditor = true } = {}) {
    if (cachedRenderFrame !== null) cancelAnimationFrame(cachedRenderFrame);
    cachedRenderFrame = requestAnimationFrame(() => {
      cachedRenderFrame = null;
      if (!keepEditor) renderCurrent();
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
    expectedStorageSnapshot = JSON.stringify(latestNotes);
    renderFromCache({ keepEditor: true });
    try {
      await chrome.storage.local.set({ [U.STORAGE_KEY]: latestNotes });
    } catch (_error) {
      expectedStorageSnapshot = null;
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
    expectedStorageSnapshot = JSON.stringify(latestNotes);
    try {
      await chrome.storage.local.set({ [U.STORAGE_KEY]: latestNotes });
    } catch (_error) {
      expectedStorageSnapshot = null;
      $("#save-state").textContent = "删除失败，请重试";
      return;
    }
    renderCurrent();
    renderLists();
    $("#save-state").textContent = "已删除";
    setTimeout(() => { $("#save-state").textContent = ""; }, 1600);
  }

  form.addEventListener("submit", saveCurrent);
  $("#delete-button").addEventListener("click", deleteCurrent);
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
    if (areaName !== "local" || !changes[U.STORAGE_KEY]) return;
    const nextNotes = changes[U.STORAGE_KEY].newValue || {};
    state.notes = nextNotes;
    const nextSnapshot = JSON.stringify(nextNotes);
    if (expectedStorageSnapshot === nextSnapshot) {
      expectedStorageSnapshot = null;
      return;
    }
    expectedStorageSnapshot = null;
    renderFromCache({ keepEditor: true });
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

  renderAll();
})();
