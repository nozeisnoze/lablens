// Evidence is aligned by physical line geometry, then by character edit alignment.
// No vocabulary correction: hidden characters must never be invented.
export function align(a, b) {
  a = [...a];
  b = [...b];
  const d = Array.from({ length: a.length + 1 }, () =>
    Array(b.length + 1).fill(0),
  );
  for (let i = 0; i <= a.length; i++) d[i][0] = i;
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
  const pairs = [];
  let i = a.length,
    j = b.length;
  while (i || j) {
    if (i && j && d[i][j] === d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      pairs.unshift([--i, --j]);
    else if (i && d[i][j] === d[i - 1][j] + 1) pairs.unshift([--i, null]);
    else pairs.unshift([null, --j]);
  }
  return { pairs, distance: d[a.length][b.length] };
}
const winner = (votes) => [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
const initialVotes = (text, weight) => {
  const votes = new Map([[text, weight]]);
  votes.observations = 1;
  votes.support = weight;
  return votes;
};
export class Fusion {
  constructor() {
    this.reset();
  }
  reset() {
    this.tracks = [];
    this.frames = 0;
    this.lastTime = -Infinity;
    this.nextId = 0;
  }
  ingest(lines, { time, quality = 1, tracking = 1 } = {}) {
    // Closely spaced captures and a lost ROI cannot strengthen consensus.
    if (
      !Number.isFinite(time) ||
      time - this.lastTime < 650 ||
      quality < 0.3 ||
      tracking < 0.65
    )
      return false;
    this.lastTime = time;
    this.frames++;
    const used = new Set();
    for (const line of [...lines].sort((a, b) => a.box.y - b.box.y)) {
      if (
        !line.text.trim() ||
        !Number.isFinite(line.confidence) ||
        line.confidence < 20
      )
        continue;
      if (
        line.box.x < 0 ||
        line.box.y < 0 ||
        line.box.x + line.box.w > 1.001 ||
        line.box.y + line.box.h > 1.001
      )
        continue;
      const center = line.box.y + line.box.h / 2;
      let track = this.tracks
        .filter(
          (t) =>
            !used.has(t.id) &&
            Math.max(
              0,
              Math.min(t.box.x + t.box.w, line.box.x + line.box.w) -
                Math.max(t.box.x, line.box.x),
            ) /
              Math.min(t.box.w, line.box.w) >
              0.15 &&
            Math.abs(t.center - center) < Math.max(0.045, line.box.h * 0.65),
        )
        .sort(
          (a, b) => Math.abs(a.center - center) - Math.abs(b.center - center),
        )[0];
      const weight =
        Math.min(0.98, Math.max(0.05, line.confidence / 100)) *
        quality *
        tracking;
      const symbols = [...line.text];
      const characterWeights = symbols.map((symbol, index) => {
        const evidence = line.characters?.[index];
        return evidence?.text === symbol && Number.isFinite(evidence.confidence)
          ? Math.min(0.98, Math.max(0.01, evidence.confidence / 100)) *
              quality *
              tracking
          : weight;
      });
      if (!track) {
        track = {
          id: this.nextId++,
          center,
          box: line.box,
          columns: symbols.map((c, index) =>
            initialVotes(c, characterWeights[index]),
          ),
          observations: 1,
          conflicts: 0,
        };
        this.tracks.push(track);
      } else {
        // Retain blank columns during alignment: dropping them shifts all later glyph votes.
        const current = track.columns.map((v) => winner(v)[0]);
        const { pairs, distance } = align(current, symbols);
        if (distance / Math.max(current.length, line.text.length) > 0.65) {
          track.conflicts++;
          used.add(track.id);
          continue;
        }
        const columns = [];
        for (const [i, j] of pairs) {
          // New characters start uncertain; absence is evidence, not invented completion.
          const v =
            i === null
              ? new Map([["", track.observations * 0.35]])
              : track.columns[i];
          if (i === null) {
            v.observations = track.observations;
            v.support = 0;
          }
          const c = j === null ? "" : symbols[j];
          const glyphWeight = j === null ? weight : characterWeights[j];
          v.set(c, (v.get(c) || 0) + glyphWeight);
          v.observations++;
          v.support += glyphWeight;
          columns.push(v);
        }
        track.columns = columns;
        track.observations++;
        track.center = track.center * 0.7 + center * 0.3;
        track.box = line.box;
      }
      used.add(track.id);
    }
    return true;
  }
  results() {
    return this.tracks
      .sort((a, b) => a.center - b.center)
      .map((t) => {
        const characters = t.columns.map((v) => {
          const [text, weight] = winner(v);
          const total = [...v.values()].reduce((a, b) => a + b, 0);
          return {
            text,
            agreement: weight / total,
            evidence: weight,
            meanSupport: v.support / v.observations,
            uncertain:
              v.support / v.observations < 0.7 ||
              weight / total < 0.8 ||
              weight < 2.2 ||
              t.observations < 3 ||
              t.conflicts > 0,
          };
        });
        const clipped =
          t.box.x < 0.025 ||
          t.box.x + t.box.w > 0.975 ||
          t.box.y < 0.025 ||
          t.box.y + t.box.h > 0.975;
        return {
          id: t.id,
          text: characters.map((c) => c.text).join(""),
          characters,
          box: t.box,
          observations: t.observations,
          clipped,
          uncertain: clipped || characters.some((c) => c.uncertain),
          agreement: Math.min(...characters.map((c) => c.agreement)),
        };
      });
  }
}
