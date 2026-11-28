import { describe, expect, it } from "vitest";
import { readCsv, csvCell } from "../../src/modules/imports/csv";
describe("bounded CSV transport", () => {
  it("reads BOM, commas, escaped quotes, multiline fields and CRLF", () => {
    expect(readCsv('\uFEFFname,note\r\nAli,"a,b"\r\nSara,"a""b\nnext"')).toEqual([
      ["name", "note"], ["Ali", "a,b"], ["Sara", 'a"b\nnext']]);
  });
  it("rejects ambiguous headings, ragged rows and malformed quoting", () => {
    for (const text of ['a,a\n1,2', 'a,b\n1', 'a\n"unfinished', 'a\n"x"bad', 'a\nx"y'])
      expect(() => readCsv(text)).toThrow();
  });
  it("bounds upload and row counts", () => {
    expect(() => readCsv('a\n' + 'x\n'.repeat(501))).toThrow();
    expect(() => readCsv('a\n' + 'x'.repeat(1000001))).toThrow();
  });
  it("quotes cells and neutralizes spreadsheet formulas", () => {
    expect(csvCell(' =SUM(A1)')).toBe('"\' =SUM(A1)"');
    expect(csvCell('a"b')).toBe('"a""b"');
    expect(csvCell(null)).toBe('""');
  });
});

