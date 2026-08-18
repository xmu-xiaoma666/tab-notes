(function installMockChrome() {
  "use strict";

  function createEvent() {
    const listeners = [];
    return {
      addListener(listener) { listeners.push(listener); },
      emit(...args) { listeners.forEach((listener) => listener(...args)); }
    };
  }

  const storageChanged = createEvent();
  const tabActivated = createEvent();
  const tabUpdated = createEvent();
  const tabRemoved = createEvent();
  const activeUrl = "https://example.com/active";
  const tabs = Array.from({ length: 100 }, (_, index) => ({
    id: index + 1,
    windowId: 1,
    index,
    active: index === 0,
    title: index === 0 ? "当前任务" : `测试标签 ${index + 1}`,
    url: index === 0 ? activeUrl : `https://example.com/page-${index + 1}`,
    favIconUrl: ""
  }));
  let notes = {};
  let prefixRules = [];
  const counts = { storageGet: 0, storageSet: 0, tabsQuery: 0 };

  function exposeCounts() {
    document.documentElement.dataset.storageGet = String(counts.storageGet);
    document.documentElement.dataset.storageSet = String(counts.storageSet);
    document.documentElement.dataset.tabsQuery = String(counts.tabsQuery);
  }

  exposeCounts();

  let saveStartedAt = 0;
  document.addEventListener("submit", () => {
    saveStartedAt = performance.now();
  }, true);
  new MutationObserver(() => {
    if (saveStartedAt && document.querySelector("#save-state")?.textContent === "已保存") {
      document.documentElement.dataset.saveUiMs = (performance.now() - saveStartedAt).toFixed(2);
      saveStartedAt = 0;
    }
  }).observe(document.querySelector("#save-state"), { childList: true, characterData: true, subtree: true });

  globalThis.__TAB_NOTES_HARNESS__ = {
    counts,
    tabs,
    activeUrl,
    async runSaveBenchmark() {
      const deadline = performance.now() + 3000;
      while (document.querySelectorAll(".page-item").length !== tabs.length) {
        if (performance.now() > deadline) throw new Error("sidepanel initial render timed out");
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      counts.storageGet = 0;
      counts.storageSet = 0;
      counts.tabsQuery = 0;
      const input = document.querySelector("#alias");
      input.value = "性能测试";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      const startedAt = performance.now();
      document.querySelector("#note-form").requestSubmit();
      while (document.querySelector("#save-state").textContent !== "已保存") {
        if (performance.now() - startedAt > 3000) throw new Error("save timed out");
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return {
        elapsedMs: performance.now() - startedAt,
        ...counts,
        renderedItems: document.querySelectorAll(".page-item").length,
        savedAlias: notes[activeUrl] && notes[activeUrl].alias
      };
    },
    async runPrefixRuleFlow() {
      const waitFor = async (predicate, message) => {
        const deadline = performance.now() + 3000;
        while (!predicate()) {
          if (performance.now() > deadline) throw new Error(message);
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
      };
      await waitFor(
        () => document.querySelectorAll(".page-item").length === tabs.length,
        "sidepanel initial render timed out"
      );

      document.querySelector("#rule-prefix").value = "https://example.com/";
      document.querySelector("#rule-alias").value = "项目默认";
      document.querySelector("#rule-tag").value = "实验";
      document.querySelector("#rule-note").value = "前缀默认备注";
      document.querySelector('[aria-label="选择规则颜色 #9270CA"]').click();
      document.querySelector("#prefix-rule-form").requestSubmit();
      await waitFor(
        () => document.querySelector("#rule-save-state").textContent === "规则已保存",
        "prefix rule save timed out"
      );
      const savedRule = prefixRules[0];
      const inherited = {
        alias: document.querySelector("#alias").value,
        tag: document.querySelector("#tag").value,
        note: document.querySelector("#note").value,
        selectedColor: document.querySelector("#color-picker .color-choice.selected")?.title || ""
      };

      document.querySelector("#alias").value = "单页覆盖";
      document.querySelector("#tag").value = "待办";
      document.querySelector("#note").value = "只属于当前网页";
      document.querySelector('[aria-label="选择颜色 #E8684A"]').click();
      document.querySelector("#note-form").requestSubmit();
      await waitFor(
        () => document.querySelector("#save-state").textContent === "已保存",
        "exact note save timed out"
      );
      const exact = notes[activeUrl];

      document.querySelector("#delete-button").click();
      await waitFor(
        () => document.querySelector("#save-state").textContent === "已恢复前缀默认",
        "exact note delete timed out"
      );
      const restored = {
        alias: document.querySelector("#alias").value,
        tag: document.querySelector("#tag").value,
        note: document.querySelector("#note").value,
        selectedColor: document.querySelector("#color-picker .color-choice.selected")?.title || ""
      };

      return {
        savedRule,
        inherited,
        exact,
        restored,
        ruleListTag: document.querySelector(".rule-item-tag")?.textContent || "",
        ruleListColor: document.querySelector(".rule-item-color")?.style.background || ""
      };
    }
  };

  globalThis.chrome = {
    storage: {
      local: {
        async get() {
          counts.storageGet += 1;
          exposeCounts();
          return { notesByUrl: notes, prefixRules };
        },
        async set(value) {
          counts.storageSet += 1;
          exposeCounts();
          const changes = {};
          if (Object.prototype.hasOwnProperty.call(value, "notesByUrl")) {
            const previous = notes;
            notes = value.notesByUrl || {};
            changes.notesByUrl = { oldValue: previous, newValue: notes };
          }
          if (Object.prototype.hasOwnProperty.call(value, "prefixRules")) {
            const previous = prefixRules;
            prefixRules = value.prefixRules || [];
            changes.prefixRules = { oldValue: previous, newValue: prefixRules };
          }
          queueMicrotask(() => storageChanged.emit(changes, "local"));
        }
      },
      onChanged: storageChanged
    },
    tabs: {
      async query(queryInfo) {
        counts.tabsQuery += 1;
        exposeCounts();
        if (queryInfo && queryInfo.active && queryInfo.currentWindow) {
          return tabs.filter((tab) => tab.active && tab.windowId === 1);
        }
        return tabs;
      },
      async get(tabId) { return tabs.find((tab) => tab.id === tabId); },
      async create() {},
      async update() {},
      onActivated: tabActivated,
      onUpdated: tabUpdated,
      onRemoved: tabRemoved
    },
    windows: {
      async getCurrent() { return { id: 1 }; },
      async update() {}
    }
  };
})();
