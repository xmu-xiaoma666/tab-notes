"use strict";

importScripts("shared.js");

const U = globalThis.TabNotesUtils;
const EDIT_TAB_NOTE_MENU_ID = "edit-tab-note";
let notesCache = null;
let notesLoadPromise = null;

async function ensureContextMenus() {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: EDIT_TAB_NOTE_MENU_ID,
    title: "修改页签备注",
    contexts: ["tab"]
  });
}

ensureContextMenus().catch(() => {});

async function getNotes() {
  if (notesCache) return notesCache;
  if (!notesLoadPromise) {
    notesLoadPromise = chrome.storage.local.get(U.STORAGE_KEY).then((result) => {
      // A storage change may arrive while the first read is in flight. Do not
      // let that older snapshot overwrite the newer onChanged value.
      if (!notesCache) notesCache = result[U.STORAGE_KEY] || {};
      return notesCache;
    }).finally(() => {
      notesLoadPromise = null;
    });
  }
  return notesLoadPromise;
}

function getNoteForUrl(notes, url) {
  return notes[U.normalizeUrl(url)] || null;
}

async function updateBadge(tabId, note) {
  if (!note || !U.hasContent(note)) {
    await chrome.action.setBadgeText({ tabId, text: "" });
    await chrome.action.setTitle({ tabId, title: "打开页签备注" });
    return;
  }
  await chrome.action.setBadgeBackgroundColor({ tabId, color: note.color || U.DEFAULT_COLOR });
  await chrome.action.setBadgeText({ tabId, text: "●" });
  await chrome.action.setTitle({ tabId, title: `备注：${U.getLabel(note)}` });
}

async function sendStateToTab(tabId, url, note) {
  if (typeof tabId !== "number" || !url || !/^https?:/i.test(url)) return;
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "NOTE_STATE",
      url: U.normalizeUrl(url),
      note
    });
  } catch (_error) {
    // Pages that were already open when the extension was installed do not
    // have the declarative content script yet. Inject it on demand so saving a
    // note takes effect immediately without forcing a page reload.
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["shared.js", "content.js"]
      });
    } catch (_injectionError) {
      // Chrome internal pages and a few protected pages cannot be injected.
    }
  }
}

async function refreshTab(tab, cachedNotes) {
  if (!tab || typeof tab.id !== "number") return;
  const notes = cachedNotes || await getNotes();
  const note = getNoteForUrl(notes, tab.url || "");
  await Promise.all([
    updateBadge(tab.id, note),
    sendStateToTab(tab.id, tab.url || "", note)
  ]);
}

async function refreshAllTabs() {
  const [tabs, notes] = await Promise.all([chrome.tabs.query({}), getNotes()]);
  await Promise.all(tabs.map((tab) => refreshTab(tab, notes)));
}

function changedNoteKeys(change) {
  const previous = change.oldValue || {};
  const next = change.newValue || {};
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  return new Set([...keys].filter((key) =>
    JSON.stringify(previous[key] || null) !== JSON.stringify(next[key] || null)
  ));
}

async function refreshChangedTabs(keys, notes) {
  if (!keys.size) return;
  const tabs = await chrome.tabs.query({});
  const affected = tabs.filter((tab) => keys.has(U.normalizeUrl(tab.url || "")));
  await Promise.all(affected.map((tab) => refreshTab(tab, notes)));
}

chrome.runtime.onInstalled.addListener((details) => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  ensureContextMenus().catch(() => {});
  if (details.reason === "install") refreshAllTabs();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  ensureContextMenus().catch(() => {});
  refreshAllTabs();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (
    info.menuItemId !== EDIT_TAB_NOTE_MENU_ID ||
    !tab ||
    typeof tab.id !== "number" ||
    typeof tab.windowId !== "number"
  ) return;

  // Keep sidePanel.open directly inside the context-menu user gesture. The
  // side panel listens to tabs.onActivated and will load the clicked tab after
  // it becomes active.
  chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
  chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
  chrome.tabs.update(tab.id, { active: true }).catch(() => {});
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId);
  await refreshTab(tab);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === "complete") refreshTab({ ...tab, id: tabId });
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[U.STORAGE_KEY]) return;
  const change = changes[U.STORAGE_KEY];
  notesCache = change.newValue || {};
  notesLoadPromise = null;
  refreshChangedTabs(changedNoteKeys(change), notesCache).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === "GET_NOTE") {
    getNotes()
      .then((notes) => getNoteForUrl(notes, message.url))
      .then((note) => sendResponse({ note }))
      .catch((error) => sendResponse({ note: null, error: error.message }));
    return true;
  }

  if (message && message.type === "OPEN_SIDE_PANEL" && sender.tab && sender.tab.windowId) {
    chrome.sidePanel.open({ windowId: sender.tab.windowId }).catch(() => {});
  }
  return false;
});
