/** Bounded RFC4180-style CSV reader. No evaluation and no storage side effects. */
export function readCsv(source: string): string[][] {
  if (new TextEncoder().encode(source).length > 1_000_000)
    throw new Error("CSV must be at most 1 MB.");
  source = source.replace(/^\uFEFF/, "");
  if (source.includes("\0")) throw new Error("CSV contains invalid characters.");
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false, closed = false;
  const field = () => { row.push(cell); cell = ""; closed = false; };
  const record = () => {
    field();
    if (row.some(v => v.trim())) rows.push(row);
    row = [];
    if (rows.length > 501) throw new Error("Upload at most 500 data rows.");
  };
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === '"') {
        if (source[i + 1] === '"') { cell += '"'; i++; }
        else { quoted = false; closed = true; }
      } else cell += c;
    } else if (c === ',') field();
    else if (c === '\r' || c === '\n') {
      if (c === '\r' && source[i + 1] === '\n') i++;
      record();
    } else if (c === '"' && !cell && !closed) quoted = true;
    else {
      if (closed || c === '"') throw new Error("Malformed CSV quoting.");
      cell += c;
    }
    if (cell.length > 10000 || row.length > 50) throw new Error("CSV field or column limit exceeded.");
  }
  if (quoted) throw new Error("Unclosed CSV quote.");
  if (cell || row.length || closed) record();
  if (rows.length < 2) throw new Error("Include column headings and at least one data row.");
  const headers = rows[0].map(v => v.trim());
  if (headers.some(v => !v) || new Set(headers).size !== headers.length)
    throw new Error("Column headings must be nonempty and unique.");
  if (rows.some(r => r.length !== headers.length)) throw new Error("Every row must have the same number of columns.");
  rows[0] = headers;
  return rows;
}
/** Prevent spreadsheet formula execution while preserving RFC4180 escaping. */
export function csvCell(value: unknown): string {
  let text = String(value ?? "");
  if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
