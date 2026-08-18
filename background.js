"use strict";

importScripts("shared.js");

const U = globalThis.TabNotesUtils;
const EDIT_TAB_NOTE_MENU_ID = "edit-tab-note";
let notesCache = null;
let prefixRulesCache = null;
let storageLoadPromise = null;

async function ensureContextMenus() {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: EDIT_TAB_NOTE_MENU_ID,
    title: "修改页签备注",
    contexts: ["tab"]
  });
}

ensureContextMenus().catch(() => {});

async function getStoredState() {
  if (notesCache !== null && prefixRulesCache !== null) {
    return { notes: notesCache, prefixRules: prefixRulesCache };
  }
  if (!storageLoadPromise) {
    storageLoadPromise = chrome.storage.local.get([U.STORAGE_KEY, U.PREFIX_RULES_KEY]).then((result) => {
      // A storage change may arrive while the first read is in flight. Do not
      // let that older snapshot overwrite the newer onChanged value.
      if (notesCache === null) notesCache = result[U.STORAGE_KEY] || {};
      if (prefixRulesCache === null) {
        prefixRulesCache = U.sanitizePrefixRules(result[U.PREFIX_RULES_KEY]);
      }
      return { notes: notesCache, prefixRules: prefixRulesCache };
    }).finally(() => {
      storageLoadPromise = null;
    });
  }
  return storageLoadPromise;
}

function getNoteForUrl(state, url, pageTitle) {
  return U.resolveNoteForUrl(state.notes, state.prefixRules, url, pageTitle);
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

async function refreshTab(tab, cachedState) {
  if (!tab || typeof tab.id !== "number") return;
  const storedState = cachedState || await getStoredState();
  const note = getNoteForUrl(storedState, tab.url || "", tab.title || "");
  await Promise.all([
    updateBadge(tab.id, note),
    sendStateToTab(tab.id, tab.url || "", note)
  ]);
}

async function refreshAllTabs() {
  const [tabs, storedState] = await Promise.all([chrome.tabs.query({}), getStoredState()]);
  await Promise.all(tabs.map((tab) => refreshTab(tab, storedState)));
}

function changedNoteKeys(change) {
  const previous = change.oldValue || {};
  const next = change.newValue || {};
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  return new Set([...keys].filter((key) =>
    JSON.stringify(previous[key] || null) !== JSON.stringify(next[key] || null)
  ));
}

function changedRulePrefixes(change) {
  const previous = U.sanitizePrefixRules(change.oldValue);
  const next = U.sanitizePrefixRules(change.newValue);
  const previousById = new Map(previous.map((rule) => [rule.id, rule]));
  const nextById = new Map(next.map((rule) => [rule.id, rule]));
  const ids = new Set([...previousById.keys(), ...nextById.keys()]);
  const prefixes = new Set();
  ids.forEach((id) => {
    const oldRule = previousById.get(id) || null;
    const newRule = nextById.get(id) || null;
    if (JSON.stringify(oldRule) === JSON.stringify(newRule)) return;
    if (oldRule && oldRule.prefix) prefixes.add(oldRule.prefix);
    if (newRule && newRule.prefix) prefixes.add(newRule.prefix);
  });
  return prefixes;
}

async function refreshChangedTabs(noteKeys, rulePrefixes, storedState) {
  if (!noteKeys.size && !rulePrefixes.size) return;
  const tabs = await chrome.tabs.query({});
  const affected = tabs.filter((tab) => {
    const url = U.normalizeUrl(tab.url || "");
    return noteKeys.has(url) || [...rulePrefixes].some((prefix) => url.startsWith(prefix));
  });
  await Promise.all(affected.map((tab) => refreshTab(tab, storedState)));
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
  if (areaName !== "local") return;
  const notesChange = changes[U.STORAGE_KEY] || null;
  const rulesChange = changes[U.PREFIX_RULES_KEY] || null;
  if (!notesChange && !rulesChange) return;
  if (notesChange) notesCache = notesChange.newValue || {};
  if (rulesChange) prefixRulesCache = U.sanitizePrefixRules(rulesChange.newValue);
  storageLoadPromise = null;
  const noteKeys = notesChange ? changedNoteKeys(notesChange) : new Set();
  const rulePrefixes = rulesChange ? changedRulePrefixes(rulesChange) : new Set();
  getStoredState()
    .then((storedState) => refreshChangedTabs(noteKeys, rulePrefixes, storedState))
    .catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === "GET_NOTE") {
    getStoredState()
      .then((storedState) => getNoteForUrl(storedState, message.url, message.pageTitle))
      .then((note) => sendResponse({ note }))
      .catch((error) => sendResponse({ note: null, error: error.message }));
    return true;
  }

  if (message && message.type === "OPEN_SIDE_PANEL" && sender.tab && sender.tab.windowId) {
    chrome.sidePanel.open({ windowId: sender.tab.windowId }).catch(() => {});
  }
  return false;
});
