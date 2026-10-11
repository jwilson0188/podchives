import assert from "node:assert/strict";
import { test } from "node:test";
import { parseWebVtt } from "../lib/youtubeCaptions";

const parse = (...cues: string[]) => parseWebVtt(`WEBVTT\n\n${cues.join('\n\n')}`, { deduplicateRolling: true });
const values = (segments: ReturnType<typeof parse>) => segments.map((s) => [s.startTimeSeconds, s.endTimeSeconds, s.transcriptText]);

test("long-gap repeated speech remains two distinct ranges", () => {
  assert.deepEqual(values(parse('00:00.000 --> 00:01.000\nThank you.', '01:40.000 --> 01:41.000\nThank you.')),
    [[0, 1, 'Thank you.'], [100, 101, 'Thank you.']]);
});

test("adjacent repeated dialogue and prefix words are preserved", () => {
  assert.deepEqual(values(parse('00:00.000 --> 00:01.000\nYes yes.', '00:01.000 --> 00:02.000\nYes yes. Again.')),
    [[0, 1, 'Yes yes.'], [1, 2, 'Yes yes. Again.']]);
});

test("overlap alone does not justify removing speech or shrinking its prior range", () => {
  assert.deepEqual(values(parse('00:00.000 --> 00:10.000\nThank you.', '00:01.000 --> 00:02.000\nThank you.')),
    [[0, 10, 'Thank you.'], [1, 2, 'Thank you.']]);
});

test("rolling cues with identical explicitly timed spans remove only those replicas", () => {
  assert.deepEqual(values(parse(
    '00:00.000 --> 00:03.000 align:start position:0%\nHello<00:01.000><c> world</c><00:02.000><c> today</c>',
    '00:01.000 --> 00:04.000\n<00:01.000>world<00:02.000> today<00:03.000> again',
  )), [[0, 1, 'Hello'], [1, 2, 'world'], [2, 3, 'today'], [3, 4, 'again']]);
});

test("same dialogue at distinct inline timestamps survives", () => {
  assert.deepEqual(values(parse('00:00.000 --> 00:03.000\n<00:00.000>yes<00:01.000> yes<00:02.000> yes')),
    [[0, 1, 'yes'], [1, 2, 'yes'], [2, 3, 'yes']]);
});

test("different text and different end timing are not presumed duplicates", () => {
  assert.deepEqual(values(parse('00:00.000 --> 00:03.000\n<00:01.000>Word.', '00:01.000 --> 00:02.000\n<00:01.000>word')),
    [[1, 3, 'Word.'], [1, 2, 'word']]);
});

test("generic feed VTT does not opt in to YouTube deduplication", () => {
  const cues = 'WEBVTT\n\n00:00.000 --> 00:02.000\n<00:01.000>yes\n\n00:01.000 --> 00:02.000\n<00:01.000>yes';
  assert.equal(parseWebVtt(cues).length, 2);
  assert.equal(parseWebVtt(cues, { deduplicateRolling: true }).length, 1);
});

test("inline timing preserves fractions and orders interleaved overlapping cues", () => {
  assert.deepEqual(values(parse('00:00.125 --> 00:03.500\nfirst<00:02.250> last', '00:01.500 --> 00:02.000\ninterjection')),
    [[0.125, 2.25, 'first'], [1.5, 2, 'interjection'], [2.25, 3.5, 'last']]);
});

test("numeric dialogue and NOTE spoken within a cue are preserved; metadata blocks are ignored", () => {
  assert.deepEqual(values(parse('NOTE ignore\n00:00.000 --> 00:00.500\nmetadata', 'STYLE\n::cue { color: red; }',
    'cue-id\n00:01.000 --> 00:02.000\n123\nNOTE this number')),
    [[1, 2, '123 NOTE this number']]);
});

test("BOM, CRLF, hour timestamps, markup and Unicode entities decode once", () => {
  assert.deepEqual(values(parseWebVtt('\uFEFFWEBVTT\r\n\r\n1\r\n01:02:03.125 --> 01:02:04.500\r\n<v Speaker><c>Hi</c> &amp; &#x1F600; &#128512; &amp;#60; &lt;tag&gt;')),
    [[3723.125, 3724.5, 'Hi & 😀 😀 &#60; <tag>']]);
});

test("invalid Unicode references cannot crash parsing", () => {
  assert.equal(parse('00:00.000 --> 00:01.000\n&#1114112; &#0; &#xD800;')[0]!.transcriptText, '� � �');
});

for (const [name, cue] of [
  ['malformed start', 'bad --> 00:01.000\nwords'],
  ['negative start', '-00:01.000 --> 00:02.000\nwords'],
  ['invalid seconds', '00:60.000 --> 01:01.000\nwords'],
  ['nonfinite timestamp', 'Infinity --> 00:01.000\nwords'],
  ['zero range', '00:01.000 --> 00:01.000\nwords'],
  ['reversed range', '00:02.000 --> 00:01.000\nwords'],
  ['inline before cue', '00:01.000 --> 00:03.000\n<00:00.500>words'],
  ['inline after cue', '00:01.000 --> 00:03.000\nwords<00:04.000> later'],
  ['reversed inline tags', '00:01.000 --> 00:04.000\n<00:03.000>words<00:02.000> earlier'],
  ['text at zero duration', '00:01.000 --> 00:02.000\nwords<00:01.000> more'],
  ['duplicate inline time', '00:01.000 --> 00:02.000\n<00:01.000>one<00:01.000> two'],
  ['malformed numeric tag', '00:01.000 --> 00:02.000\n<00:bad>words'],
]) test(`rejects ${name} instead of inventing transcript timing`, () => {
  assert.throws(() => parse(cue), /WebVTT/);
});

test("unordered source cues reject the full parse", () => {
  assert.throws(() => parse('00:02.000 --> 00:03.000\nfirst', '00:01.000 --> 00:02.000\nsecond'), /order/);
});


test("inline timing inside words or before attached punctuation does not invent spaces", () => {
  assert.deepEqual(values(parse('00:00.000 --> 00:03.000\nhel<00:01.000>lo<00:02.000>!')),
    [[0, 3, 'hello!']]);
});
