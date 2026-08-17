(function initTabNotesUtils(root) {
  "use strict";

  const STORAGE_KEY = "notesByUrl";
  const DEFAULT_COLOR = "#5B8FF9";
  const COLORS = [
    "#5B8FF9",
    "#61DDAA",
    "#F6BD16",
    "#E8684A",
    "#9270CA",
    "#6DC8EC",
    "#FF99C3",
    "#65789B"
  ];

  function normalizeUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== "string") return "";
    try {
      const url = new URL(rawUrl);
      if (url.protocol === "http:" || url.protocol === "https:") {
        return url.href;
      }
      return rawUrl;
    } catch (_error) {
      return rawUrl;
    }
  }

  function cleanText(value, maxLength) {
    const normalized = String(value || "")
      .replace(/\s+/g, " ")
      .trim();
    return Array.from(normalized).slice(0, maxLength).join("");
  }

  function sanitizeNote(input, previous) {
    const old = previous || {};
    const now = new Date().toISOString();
    return {
      url: normalizeUrl(input.url || old.url || ""),
      pageTitle: cleanText(input.pageTitle || old.pageTitle, 300),
      alias: cleanText(input.alias, 24),
      tag: cleanText(input.tag, 16),
      note: String(input.note || "").trim().slice(0, 2000),
      color: COLORS.includes(input.color) ? input.color : DEFAULT_COLOR,
      showCard: Boolean(input.showCard),
      createdAt: old.createdAt || now,
      updatedAt: now
    };
  }

  function hasContent(note) {
    return Boolean(note && (note.alias || note.tag || note.note));
  }

  function colorDot(color) {
    const index = COLORS.indexOf(color);
    return ["🔵", "🟢", "🟡", "🟠", "🟣", "🔷", "🩷", "⚫"][index < 0 ? 0 : index];
  }

  function getLabel(note) {
    if (!note) return "";
    return cleanText(note.alias || note.tag || note.note || "备注", 24);
  }

  function getTitleLabel(note) {
    if (!note) return "";
    const primary = cleanText(note.alias || note.tag, 24).replace(/[·｜|]/g, "•");
    const noteSummary = cleanText(note.note, 32).replace(/[·｜|]/g, "•");
    if (primary && noteSummary && primary !== noteSummary) return `${primary}｜${noteSummary}`;
    return primary || noteSummary || "备注";
  }

  function makePrefix(note) {
    if (!hasContent(note)) return "";
    return `${colorDot(note.color)} ${getTitleLabel(note)} · `;
  }

  function stripTabNotePrefixes(value) {
    let title = String(value || "");
    const prefixPattern = /^(?:🔵|🟢|🟡|🟠|🟣|🔷|🩷|⚫)\s[^\n]{1,100}?\s·\s/u;
    for (let index = 0; index < 200 && prefixPattern.test(title); index += 1) {
      title = title.replace(prefixPattern, "");
    }
    return title;
  }

  function formatTabTitle(note, baseTitle) {
    const prefix = makePrefix(note);
    const cleanBaseTitle = stripTabNotePrefixes(baseTitle || (note && note.pageTitle) || "网页");
    return prefix ? `${prefix}${cleanBaseTitle}` : cleanBaseTitle;
  }

  function matchesSearch(note, tab, query) {
    const q = cleanText(query, 100).toLocaleLowerCase();
    if (!q) return true;
    const haystack = [
      note && note.alias,
      note && note.tag,
      note && note.note,
      note && note.pageTitle,
      tab && tab.title,
      tab && tab.url
    ]
      .filter(Boolean)
      .join("\n")
      .toLocaleLowerCase();
    return haystack.includes(q);
  }

  const api = {
    STORAGE_KEY,
    DEFAULT_COLOR,
    COLORS,
    normalizeUrl,
    cleanText,
    sanitizeNote,
    hasContent,
    colorDot,
    getLabel,
    getTitleLabel,
    makePrefix,
    stripTabNotePrefixes,
    formatTabTitle,
    matchesSearch
  };

  root.TabNotesUtils = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
