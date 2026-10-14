import test from "node:test";
import assert from "node:assert/strict";
import { Fusion, align } from "../src/fusion.js";
import { Session, csvCell } from "../src/session.js";
const line = (text, y = 0.2, confidence = 95, x = 0.1) => ({
  text,
  confidence,
  box: { x, y, w: 0.8, h: 0.06 },
});
test("high-confidence lines cannot hide a consistently weak individual glyph", () => {
  const f = new Fusion();
  for (let i = 0; i < 30; i++)
    f.ingest(
      [
        {
          ...line("AB1", 0.2, 96),
          characters: [
            { text: "A", confidence: 99 },
            { text: "B", confidence: 99 },
            { text: "1", confidence: 22 },
          ],
        },
      ],
      { time: i * 900 },
    );
  assert.equal(f.results()[0].characters[0].uncertain, false);
  assert.equal(f.results()[0].characters[2].uncertain, true);
  assert.equal(f.results()[0].uncertain, true);
});
test("same-height text at different horizontal positions never swaps physical tracks", () => {
  const f = new Fusion();
  const left = { ...line("A"), box: { x: 0.1, y: 0.2, w: 0.2, h: 0.06 } },
    right = { ...line("B"), box: { x: 0.7, y: 0.2, w: 0.2, h: 0.06 } };
  f.ingest([left, right], { time: 0 });
  f.ingest([right, left], { time: 900 });
  assert.deepEqual(
    f.results().map((l) => l.text),
    ["A", "B"],
  );
  assert.equal(f.results()[0].observations, 2);
});
test("physical lines fuse across frames without concatenation or forced sample vocabulary", () => {
  const f = new Fusion();
  for (let i = 0; i < 4; i++)
    f.ingest(
      [
        line("Kim", 0.2 + i * 0.001),
        line(i === 1 ? "TM0I029" : "TM01029", 0.45),
        line("malin P5 M", 0.72),
      ],
      { time: i * 900 },
    );
  assert.deepEqual(
    f.results().map((l) => l.text),
    ["Kim", "TM01029", "malin P5 M"],
  );
  assert.equal(f.results()[0].uncertain, false);
  assert.equal(f.results()[1].uncertain, true); // disputed glyph must be reviewed
  assert.equal(f.results()[1].characters[3].uncertain, true);
});
test("insertions and deletions align character positions; never add expected hidden suffix", () => {
  const f = new Fusion();
  ["ABC12", "ABC2", "ABC12"].forEach((s, i) =>
    f.ingest([line(s)], { time: i * 900 }),
  );
  assert.equal(f.results()[0].text, "ABC12");
  assert.equal(f.results()[0].uncertain, true);
  assert.equal(align("ABC12", "ABC2").distance, 1);
});
test("lost tracking, low quality, background and rapid duplicate frames do not accumulate", () => {
  const f = new Fusion();
  assert.equal(
    f.ingest([line("background")], { time: 0, tracking: 0.3 }),
    false,
  );
  assert.equal(f.ingest([line("blur")], { time: 0, quality: 0.2 }), false);
  f.ingest(
    [
      line("outside", 1.2),
      line("background", 0.2, 90, -0.3),
      line("faint", 0.3, 10),
      line("Kim"),
    ],
    { time: 900 },
  );
  assert.equal(f.ingest([line("Kim")], { time: 1000 }), false);
  assert.deepEqual(
    f.results().map((l) => l.text),
    ["Kim"],
  );
  assert.equal(f.results()[0].uncertain, true);
});
test("reset removes every previous line, character vote, and frame timestamp", () => {
  const f = new Fusion();
  f.ingest([line("OLD")], { time: 10000 });
  f.reset();
  assert.deepEqual(f.results(), []);
  f.ingest([line("NEW")], { time: 0 });
  assert.deepEqual(
    f.results().map((l) => l.text),
    ["NEW"],
  );
});
test("crop-edge text remains uncertain even when repeated with high agreement", () => {
  const f = new Fusion();
  for (let i = 0; i < 4; i++)
    f.ingest([line("PARTIAL", 0.2, 99, 0)], { time: i * 900 });
  assert.equal(f.results()[0].clipped, true);
  assert.equal(f.results()[0].uncertain, true);
});
test("one confirmation records lines; explicit locations deduplicate without dropping aliquots", () => {
  const s = new Session(),
    r = {
      sampleId: " A ",
      box: " B ",
      position: "1",
      lines: ["Kim", "A", "partial"],
      uncertainty: true,
    };
  assert.ok(s.add(r).record);
  assert.equal(s.add(r).duplicate, true);
  assert.equal(s.records.length, 1);
  s.add({ ...r, position: "2" });
  s.add({ ...r, position: "" });
  s.add({ ...r, position: "" });
  s.add(r, { allowDuplicate: true });
  assert.equal(s.records.length, 5);
  assert.equal(s.records[0].sampleId, "A");
  r.lines[0] = "changed";
  assert.equal(s.records[0].lines[0], "Kim");
});
test("CSV quotes commas, quotes and newlines and neutralizes formula prefixes in every field", () => {
  const s = new Session();
  s.add({
    sampleId: "=SUM(1,2)",
    box: " \t@x",
    position: "-1",
    lines: ['say "hi", now', "two\nlines", "+CMD"],
    uncertainty: true,
  });
  const csv = s.csv();
  assert.ok(csv.includes('"\'=SUM(1,2)"'));
  assert.ok(csv.includes('"\'@x"'));
  assert.equal(csvCell(" \t@x"), '"\' \t@x"');
  assert.ok(csv.includes('"say ""hi"", now"'));
  assert.ok(csv.includes('"two\nlines"'));
  assert.ok(csv.includes('"\'+CMD"'));
  assert.equal(csvCell("\tformula"), '"\'\tformula"');
  assert.ok(csv.endsWith("\r\n"));
  assert.ok(csv.includes("Review required"));
});
test("CSV supports more than three label lines and invalid confirmation cannot append", () => {
  const s = new Session();
  assert.throws(() =>
    s.add({ sampleId: "", box: "", position: "", lines: ["a"] }),
  );
  assert.equal(s.records.length, 0);
  s.add({
    sampleId: "A",
    box: "",
    position: "",
    lines: ["one", "two", "three", "four"],
  });
  assert.ok(s.csv().includes("Line 4"));
});

test("temporarily hidden glyph columns do not shift later votes when the glyph reappears", () => {
  const f = new Fusion();
  ["ABCD", "ACD", "ACD", "ACD", "ABCD", "ABCD", "ABCD", "ABCD"].forEach(
    (text, i) => f.ingest([line(text)], { time: i * 900 }),
  );
  assert.equal(f.results()[0].text, "ABCD");
  assert.equal(f.results()[0].characters.length, 4);
  assert.equal(f.results()[0].characters[1].uncertain, true);
});
