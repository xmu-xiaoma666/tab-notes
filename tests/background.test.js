"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const U = require(path.join(root, "shared.js"));
const source = fs.readFileSync(path.join(root, "background.js"), "utf8");

function eventSlot() {
  let listener = null;
  return {
    addListener(next) { listener = next; },
    emit(...args) { return listener && listener(...args); },
    get listener() { return listener; }
  };
}

const storageChanged = eventSlot();
const tabActivated = eventSlot();
const tabUpdated = eventSlot();
const installed = eventSlot();
const startup = eventSlot();
const message = eventSlot();
const menuClicked = eventSlot();

const targetUrl = "https://example.com/task";
const otherUrl = "https://example.com/other";
const tabs = Array.from({ length: 100 }, (_, index) => ({
  id: index + 1,
  windowId: 1,
  url: index === 42 ? targetUrl : `${otherUrl}/${index}`
}));

let notes = {
  [targetUrl]: U.sanitizeNote({ url: targetUrl, alias: "旧备注" })
};
let prefixRules = [];
let storageReads = 0;
const messagedTabs = [];
const badgedTabs = [];
const createdMenus = [];
const openedPanelWindows = [];
const focusedWindows = [];
const activatedTabs = [];

const chrome = {
  contextMenus: {
    removeAll: async () => {},
    create: (options) => { createdMenus.push(options); },
    onClicked: menuClicked
  },
  storage: {
    local: {
      async get() {
        storageReads += 1;
        return {
          [U.STORAGE_KEY]: notes,
          [U.PREFIX_RULES_KEY]: prefixRules
        };
      }
    },
    onChanged: storageChanged
  },
  tabs: {
    async query() { return tabs; },
    async get(tabId) { return tabs.find((tab) => tab.id === tabId); },
    async sendMessage(tabId) { messagedTabs.push(tabId); },
    async update(tabId, options) { activatedTabs.push({ tabId, options }); },
    onActivated: tabActivated,
    onUpdated: tabUpdated
  },
  action: {
    async setBadgeText({ tabId }) { badgedTabs.push(tabId); },
    async setBadgeBackgroundColor() {},
    async setTitle() {}
  },
  scripting: { executeScript: async () => {} },
  sidePanel: {
    setPanelBehavior: async () => {},
    async open(options) { openedPanelWindows.push(options.windowId); }
  },
  windows: {
    async update(windowId, options) { focusedWindows.push({ windowId, options }); }
  },
  runtime: {
    onInstalled: installed,
    onStartup: startup,
    onMessage: message
  }
};

const context = {
  chrome,
  console,
  globalThis: null,
  importScripts() {}
};
context.globalThis = context;
context.TabNotesUtils = U;
vm.runInNewContext(source, context, { filename: "background.js" });

async function requestNote(url) {
  return new Promise((resolve, reject) => {
    const keepOpen = message.listener({ type: "GET_NOTE", url }, {}, resolve);
    if (keepOpen !== true) reject(new Error("GET_NOTE did not keep the response channel open"));
  });
}

(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(JSON.stringify(createdMenus[0]), JSON.stringify({
    id: "edit-tab-note",
    title: "修改页签备注",
    contexts: ["tab"]
  }), "the existing tab context-menu entry must remain registered");
  menuClicked.emit({ menuItemId: "edit-tab-note" }, { id: 7, windowId: 3 });
  assert.deepEqual(openedPanelWindows, [3]);
  assert.equal(JSON.stringify(focusedWindows), JSON.stringify([{ windowId: 3, options: { focused: true } }]));
  assert.equal(JSON.stringify(activatedTabs), JSON.stringify([{ tabId: 7, options: { active: true } }]));

  const first = await requestNote(targetUrl);
  const second = await requestNote(targetUrl);
  assert.equal(first.note.alias, "旧备注");
  assert.equal(second.note.alias, "旧备注");
  assert.equal(storageReads, 1, "repeated reads should use the in-memory cache");

  const previous = notes;
  notes = {
    ...notes,
    [targetUrl]: U.sanitizeNote({ url: targetUrl, alias: "新备注" }, notes[targetUrl])
  };
  storageChanged.emit({
    [U.STORAGE_KEY]: { oldValue: previous, newValue: notes }
  }, "local");
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.deepEqual(messagedTabs, [43], "only tabs for the changed URL should receive state");
  assert.deepEqual(badgedTabs, [43], "only tabs for the changed URL should refresh badges");
  assert.equal(storageReads, 1, "storage changes should update the cache without another read");

  messagedTabs.length = 0;
  badgedTabs.length = 0;
  tabActivated.emit({ tabId: 1 });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(messagedTabs, [1]);
  assert.deepEqual(badgedTabs, [1]);
  assert.equal(storageReads, 1, "tab activation should also reuse cached notes");

  messagedTabs.length = 0;
  badgedTabs.length = 0;
  const previousRules = prefixRules;
  prefixRules = [U.sanitizePrefixRule({
    id: "rule-1",
    prefix: `${otherUrl}/0`,
    alias: "批量默认标题",
    tag: "实验",
    color: "#61DDAA",
    note: "前缀默认备注"
  })];
  storageChanged.emit({
    [U.PREFIX_RULES_KEY]: { oldValue: previousRules, newValue: prefixRules }
  }, "local");
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(messagedTabs, [1], "a prefix-rule change should refresh only matching tabs");
  assert.deepEqual(badgedTabs, [1]);

  const inherited = await requestNote(`${otherUrl}/0`);
  assert.equal(inherited.note.alias, "批量默认标题");
  assert.equal(inherited.note.tag, "实验");
  assert.equal(inherited.note.color, "#61DDAA");
  assert.equal(inherited.note.note, "前缀默认备注");

  console.log("background.js cache and targeted-refresh tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
