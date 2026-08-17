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

console.log("shared.js tests passed");
