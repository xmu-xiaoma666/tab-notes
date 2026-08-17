(function initTabNotesContent() {
  "use strict";

  if (globalThis.__TAB_NOTES_CONTENT_LOADED__) return;
  globalThis.__TAB_NOTES_CONTENT_LOADED__ = true;

  const U = globalThis.TabNotesUtils;
  const HOST_ID = "__tab_notes_card_host__";
  const OWNER_ATTRIBUTE = "data-tab-notes-owner";
  const DISPOSE_EVENT = "__tab_notes_dispose__";
  const instanceId = globalThis.crypto && typeof globalThis.crypto.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;

  // DOM events cross Chrome's isolated content-script worlds. A newly loaded
  // extension instance uses this event to shut down the observer and timer
  // left by a previous extension reload before taking ownership.
  document.dispatchEvent(new Event(DISPOSE_EVENT));
  document.documentElement.setAttribute(OWNER_ATTRIBUTE, instanceId);

  let disposed = false;
  let titleObserver = null;
  let urlWatchTimer = null;
  let currentUrl = U.normalizeUrl(location.href);
  let currentNote = null;
  let baseTitle = U.stripTabNotePrefixes(document.title);
  let activePrefix = "";
  let writingTitle = false;
  let cardHiddenForSession = false;

  function isOwner() {
    return !disposed && document.documentElement.getAttribute(OWNER_ATTRIBUTE) === instanceId;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    titleObserver?.disconnect();
    if (urlWatchTimer) clearInterval(urlWatchTimer);
    document.removeEventListener(DISPOSE_EVENT, dispose);
    try {
      chrome.runtime.onMessage.removeListener(runtimeMessageListener);
    } catch (_error) {
      // The old extension context may already be invalid after a reload.
    }
    removeCard();
    if (document.documentElement.getAttribute(OWNER_ATTRIBUTE) === instanceId) {
      document.documentElement.removeAttribute(OWNER_ATTRIBUTE);
    }
    globalThis.__TAB_NOTES_CONTENT_LOADED__ = false;
  }

  document.addEventListener(DISPOSE_EVENT, dispose, { once: true });

  function setDocumentTitle(note) {
    if (!isOwner()) return;
    const nextPrefix = U.makePrefix(note);
    const currentTitle = document.title;
    const visibleBaseTitle = U.stripTabNotePrefixes(currentTitle);

    if (!writingTitle && visibleBaseTitle) {
      baseTitle = visibleBaseTitle;
    }

    activePrefix = nextPrefix;
    const nextTitle = U.formatTabTitle(note, baseTitle);
    if (nextTitle && document.title !== nextTitle) {
      writingTitle = true;
      document.title = nextTitle;
      queueMicrotask(() => {
        writingTitle = false;
      });
    }
  }

  function removeCard() {
    document.getElementById(HOST_ID)?.remove();
  }

  function renderCard(note) {
    if (!isOwner()) return;
    removeCard();
    if (!note || !note.showCard || !U.hasContent(note) || cardHiddenForSession) return;

    const host = document.createElement("div");
    host.id = HOST_ID;
    host.style.cssText = "all:initial;position:fixed;top:18px;right:18px;z-index:2147483647;";
    const shadow = host.attachShadow({ mode: "closed" });
    const wrapper = document.createElement("aside");
    wrapper.innerHTML = `
      <style>
        :host { all: initial; }
        .card { width: 286px; color: #172033; background: rgba(255,255,255,.97); border: 1px solid rgba(20,35,70,.14); border-radius: 14px; box-shadow: 0 12px 38px rgba(18,30,60,.18); font: 13px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif; overflow: hidden; backdrop-filter: blur(14px); }
        .head { display: flex; align-items: center; gap: 8px; padding: 10px 10px 9px 12px; border-bottom: 1px solid #edf0f5; cursor: pointer; user-select: none; }
        .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--note-color); box-shadow: 0 0 0 3px color-mix(in srgb,var(--note-color) 18%,transparent); }
        .label { min-width: 0; flex: 1; color: #1d2a44; font-size: 13px; font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        button { border: 0; background: transparent; color: #7a8497; border-radius: 7px; cursor: pointer; font: inherit; padding: 2px 6px; }
        button:hover { background: #eef3ff; color: #315fbd; }
        .body { padding: 11px 12px 12px; }
        .tag { display: inline-block; margin-bottom: 7px; padding: 2px 7px; border-radius: 999px; color: #3b5d99; background: #edf3ff; font-size: 11px; }
        .note { color: #3c465a; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 180px; overflow: auto; }
        .actions { display: flex; justify-content: flex-end; margin-top: 9px; }
        .edit { color: #315fbd; background: #edf3ff; padding: 4px 9px; }
        .collapsed .body { display: none; }
        @media (prefers-color-scheme: dark) {
          .card { color: #eef3ff; background: rgba(29,32,39,.97); border-color: #454a55; }
          .head { border-color: #3a3f49; }
          .label { color: #f1f4fb; }
          .note { color: #d3d9e5; }
          button:hover { background: #3b4352; color: #a9c6ff; }
          .tag,.edit { color: #b7ceff; background: #303e5a; }
        }
      </style>
      <section class="card" style="--note-color:${note.color || U.DEFAULT_COLOR}">
        <header class="head" title="点击折叠或展开">
          <span class="dot"></span>
          <span class="label"></span>
          <button class="collapse" title="折叠">−</button>
          <button class="close" title="本次隐藏">×</button>
        </header>
        <div class="body">
          <span class="tag"></span>
          <div class="note"></div>
          <div class="actions"><button class="edit">编辑备注</button></div>
        </div>
      </section>`;

    const card = wrapper.querySelector(".card");
    wrapper.querySelector(".label").textContent = U.getLabel(note);
    const tag = wrapper.querySelector(".tag");
    tag.textContent = note.tag || "网页备注";
    wrapper.querySelector(".note").textContent = note.note || "已为这个网页设置标签标题。";
    wrapper.querySelector(".head").addEventListener("click", (event) => {
      if (event.target.closest("button")) return;
      card.classList.toggle("collapsed");
      wrapper.querySelector(".collapse").textContent = card.classList.contains("collapsed") ? "+" : "−";
    });
    wrapper.querySelector(".collapse").addEventListener("click", () => {
      card.classList.toggle("collapsed");
      wrapper.querySelector(".collapse").textContent = card.classList.contains("collapsed") ? "+" : "−";
    });
    wrapper.querySelector(".close").addEventListener("click", () => {
      cardHiddenForSession = true;
      removeCard();
    });
    wrapper.querySelector(".edit").addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" });
    });

    shadow.append(wrapper);
    document.documentElement.append(host);
  }

  function applyNote(note) {
    if (!isOwner()) return;
    currentNote = note;
    setDocumentTitle(note);
    renderCard(note);
  }

  async function requestState() {
    if (!isOwner()) return;
    currentUrl = U.normalizeUrl(location.href);
    try {
      const response = await chrome.runtime.sendMessage({ type: "GET_NOTE", url: currentUrl });
      if (!isOwner()) return;
      applyNote(response && response.note);
    } catch (_error) {
      if (!isOwner()) return;
      applyNote(null);
    }
  }

  titleObserver = new MutationObserver(() => {
    if (!isOwner()) {
      dispose();
      return;
    }
    if (writingTitle) return;
    const title = document.title;
    if (activePrefix && title.startsWith(activePrefix)) return;
    baseTitle = U.stripTabNotePrefixes(title);
    setDocumentTitle(currentNote);
  });

  if (document.head) {
    titleObserver.observe(document.head, { subtree: true, childList: true, characterData: true });
  }

  function runtimeMessageListener(message) {
    if (!message || message.type !== "NOTE_STATE") return;
    if (message.url === U.normalizeUrl(location.href)) applyNote(message.note);
  }

  chrome.runtime.onMessage.addListener(runtimeMessageListener);

  urlWatchTimer = setInterval(() => {
    if (!isOwner()) {
      dispose();
      return;
    }
    const nextUrl = U.normalizeUrl(location.href);
    if (nextUrl !== currentUrl) {
      if (activePrefix && document.title.startsWith(activePrefix)) {
        document.title = U.stripTabNotePrefixes(document.title);
      }
      activePrefix = "";
      baseTitle = U.stripTabNotePrefixes(document.title);
      cardHiddenForSession = false;
      requestState();
    }
  }, 1000);

  requestState();
})();
