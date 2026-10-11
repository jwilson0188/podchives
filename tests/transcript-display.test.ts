import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { highlight } from "../lib/utils";
import { parseWebVtt } from "../lib/youtubeCaptions";

const render = (text: string, query = "") => renderToStaticMarkup(createElement("p", null, highlight(text, query)));

test("empty-query transcript markup is escaped as text", () => {
  assert.equal(render('<img src=x onerror="alert(1)"><script>x</script>'),
    '<p>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&lt;script&gt;x&lt;/script&gt;</p>');
});

test("matching markup in both transcript and query remains inert inside a controlled mark", () => {
  assert.equal(render('before <svg onload="x"> after', '<svg onload="x">'),
    '<p>before <mark class="search-hit">&lt;svg onload=&quot;x&quot;&gt;</mark> after</p>');
});

test("unmatched markup is escaped when a different word is highlighted", () => {
  assert.equal(render('<img src=x> hello', 'hello'),
    '<p>&lt;img src=x&gt; <mark class="search-hit">hello</mark></p>');
});

test("highlight preserves case and repeated literal matches", () => {
  assert.equal(render('Yes, YES, yes.', 'yes'),
    '<p><mark class="search-hit">Yes</mark>, <mark class="search-hit">YES</mark>, <mark class="search-hit">yes</mark>.</p>');
});

test("query regex metacharacters have literal meaning", () => {
  const query = '.*+?^${}()|[]\\';
  assert.equal(render(`a ${query} b`, query), `<p>a <mark class="search-hit">${query}</mark> b</p>`);
});

test("entities and quotes remain literal text rather than being decoded by highlighting", () => {
  assert.equal(render('&lt;tag&gt; & "quotes"', '&lt;'),
    '<p><mark class="search-hit">&amp;lt;</mark>tag&amp;gt; &amp; &quot;quotes&quot;</p>');
});

test("empty and unmatched text retain their contents", () => {
  assert.equal(render('', 'anything'), '<p></p>');
  assert.equal(render('plain text', 'absent'), '<p>plain text</p>');
});

test("entity-encoded caption markup is inert through parsing and highlight rendering", () => {
  const [segment] = parseWebVtt('WEBVTT\n\n00:00.000 --> 00:01.000\n&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(render(segment!.transcriptText), '<p>&lt;img src=x onerror=alert(1)&gt;</p>');
});
