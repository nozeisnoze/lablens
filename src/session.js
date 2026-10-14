export const csvCell = (value) => {
  let s = String(value ?? "");
  if (/^[\s\u0000-\u001f]*[=+@-]/u.test(s) || /^[\t\r\n]/u.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
};
export class Session {
  constructor() {
    this.records = [];
  }
  add(
    { sampleId, box, position, lines, uncertainty = false },
    { allowDuplicate = false } = {},
  ) {
    sampleId = sampleId.trim();
    box = box.trim();
    position = position.trim();
    if (!sampleId || !lines.some((s) => s.trim()))
      throw new Error("Enter a sample ID and at least one label line.");
    const duplicate =
      box &&
      position &&
      this.records.some(
        (r) =>
          r.sampleId === sampleId && r.box === box && r.position === position,
      );
    if (duplicate && !allowDuplicate) return { duplicate: true };
    const record = {
      sampleId,
      box,
      position,
      lines: [...lines],
      uncertainty,
      confirmedAt: new Date().toISOString(),
    };
    this.records.push(record);
    return { record };
  }
  csv() {
    const count = Math.max(3, ...this.records.map((r) => r.lines.length));
    return (
      [
        [
          "Sample ID",
          "Box",
          "Position",
          ...Array.from({ length: count }, (_, i) => `Line ${i + 1}`),
          "OCR uncertainty",
          "Confirmed at",
        ],
        ...this.records.map((r) => [
          r.sampleId,
          r.box,
          r.position,
          ...Array.from({ length: count }, (_, i) => r.lines[i] || ""),
          r.uncertainty ? "Review required" : "Consensus",
          r.confirmedAt,
        ]),
      ]
        .map((row) => row.map(csvCell).join(","))
        .join("\r\n") + "\r\n"
    );
  }
}
