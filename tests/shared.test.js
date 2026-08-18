"use strict";

const assert = require("node:assert/strict");
const U = require("../shared.js");

assert.equal(
  U.normalizeUrl("https://example.com/a?x=1#section"),
  "https://example.com/a?x=1#section"
);
assert.equal(U.normalizeUrl("chrome://extensions/"), "chrome://extensions/");

const note = U.sanitizeNote({
  url: "https://example.com/page#anchor",
  pageTitle: "  Example   Page  ",
  alias: "  Rednote ",
  tag: " 产品资料 ",
  note: "Rednote 是小红书的英文名",
  color: "#9270CA",
  showCard: true
});

assert.equal(note.url, "https://example.com/page#anchor");
assert.equal(note.pageTitle, "Example Page");
assert.equal(note.alias, "Rednote");
assert.equal(U.makePrefix(note), "🟣 Rednote｜Rednote 是小红书的英文名 · ");
assert.equal(U.formatTabTitle(note, "产品主页"), "🟣 Rednote｜Rednote 是小红书的英文名 · 产品主页");
assert.equal(
  U.stripTabNotePrefixes("🔵 资料1 · 🟣 Rednote · 产品主页"),
  "产品主页"
);
assert.equal(
  U.formatTabTitle(note, "🔵 资料1 · 🟣 Rednote · 产品主页"),
  "🟣 Rednote｜Rednote 是小红书的英文名 · 产品主页"
);
assert.equal(
  U.makePrefix({ alias: "", tag: "", note: "只填写详细备注", color: "#5B8FF9" }),
  "🔵 只填写详细备注 · "
);
const delimiterNote = {
  alias: "资料1",
  tag: "",
  note: "阶段一 · 检查说明",
  color: "#5B8FF9"
};
const delimiterTitle = U.formatTabTitle(delimiterNote, "Rednote 资料页");
assert.equal(delimiterTitle, "🔵 资料1｜阶段一 • 检查说明 · Rednote 资料页");
assert.equal(U.stripTabNotePrefixes(delimiterTitle), "Rednote 资料页");
assert.equal(U.formatTabTitle(delimiterNote, delimiterTitle), delimiterTitle);
const emojiBoundaryNote = {
  alias: "",
  tag: "",
  note: `${"a".repeat(31)}😀尾部`,
  color: "#5B8FF9"
};
assert.equal(U.getTitleLabel(emojiBoundaryNote), `${"a".repeat(31)}😀`);
assert.equal(Array.from(U.getTitleLabel(emojiBoundaryNote)).length, 32);
assert.equal(U.matchesSearch(note, null, "REDNOTE"), true);
assert.equal(U.matchesSearch(note, null, "论文"), false);
assert.equal(U.hasContent({ alias: "", tag: "", note: "" }), false);

const broadRule = U.sanitizePrefixRule({
  id: "rule-broad",
  prefix: "https://example.com/projects/",
  alias: "项目页面",
  note: "默认项目备注",
  createdAt: "2026-08-18T00:00:00.000Z",
  updatedAt: "2026-08-18T00:00:00.000Z"
});
assert.equal(broadRule.tag, "", "old rules without a category should stay compatible");
assert.equal(broadRule.color, U.DEFAULT_COLOR, "old rules without a color should use the default");
const specificRule = U.sanitizePrefixRule({
  id: "rule-specific",
  prefix: "https://example.com/projects/repa/",
  alias: "RePA",
  tag: "实验",
  note: "默认查看 RePA 实验",
  color: "#9270CA",
  createdAt: "2026-08-18T00:00:01.000Z",
  updatedAt: "2026-08-18T00:00:01.000Z"
});
assert.equal(U.PREFIX_RULES_KEY, "prefixRules");
assert.equal(U.normalizePrefix(" https://EXAMPLE.com/projects/ "), "https://example.com/projects/");
assert.equal(U.normalizePrefix("chrome://extensions/"), "");
assert.equal(
  U.findMatchingPrefixRule([broadRule, specificRule], "https://example.com/projects/repa/run/1").id,
  "rule-specific",
  "the longest matching prefix should win"
);
const inherited = U.resolveNoteForUrl(
  {},
  [broadRule, specificRule],
  "https://example.com/projects/repa/run/1",
  "实验 1"
);
assert.equal(inherited.alias, "RePA");
assert.equal(inherited.tag, "实验");
assert.equal(inherited.note, "默认查看 RePA 实验");
assert.equal(inherited.color, "#9270CA");
assert.equal(inherited.pageTitle, "实验 1");

const exactUrl = "https://example.com/projects/repa/run/1";
const exactNote = U.sanitizeNote({
  url: exactUrl,
  alias: "单页标题",
  note: "手动修改后的详细备注",
  color: "#E8684A"
});
const resolvedExact = U.resolveNoteForUrl(
  { [exactUrl]: exactNote },
  [broadRule, specificRule],
  exactUrl,
  "实验 1"
);
assert.equal(resolvedExact.alias, "单页标题", "an exact note should keep the original per-page behavior");
assert.equal(resolvedExact.note, "手动修改后的详细备注");
assert.equal(resolvedExact.color, "#E8684A");

console.log("shared.js tests passed");
